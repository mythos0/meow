using System;
using System.Collections.Generic;
using System.Linq;

namespace MeowCat.Core;

public enum SpriteView { Side, Front }   // Side clips flip with Facing; Front clips never flip

/// <summary>One animated clip: a folder of frame_XX.png plus playback rules.</summary>
public sealed record SpriteClip(string Name, double Fps, bool Loop, SpriteView View)
{
    /// <summary>Fps multiplier applied when a clip is re-used as another action (e.g. walk→run).</summary>
    public double SpeedUp { get; init; } = 1.0;
}

/// <summary>Resolved frame request — which breed folder/clip actually plays.</summary>
public sealed record ResolvedClip(string BreedId, SpriteClip Clip);

/// <summary>
/// Maps every CatState to a sprite clip, and every breed to its own asset folder with a
/// graceful fallback chain (breed folder → breed walk/sit reuse → default breed folder).
/// Pure data + pure functions: fully unit-testable without WPF.
/// </summary>
public static class SpriteCatalog
{
    public const string DefaultBreed = "grey_tabby";
    public const int FrameBox = 512;               // art box (px) of every processed frame
    public const int MaxFramesPerClip = 8;

    /// <summary>The clips, keyed by clip name.</summary>
    public static readonly IReadOnlyDictionary<string, SpriteClip> Clips = new Dictionary<string, SpriteClip>
    {
        // motion clips ship 8 interleaved frames; fps tuned so one loop = one natural gait cycle
        ["walk"]    = new SpriteClip("walk",    9.0, true,  SpriteView.Side),
        ["run"]     = new SpriteClip("run",    13.0, true,  SpriteView.Side),
        ["jump"]    = new SpriteClip("jump",   11.0, false, SpriteView.Side),
        ["dance"]   = new SpriteClip("dance",   7.0, true,  SpriteView.Front),
        ["scratch"] = new SpriteClip("scratch", 9.0, true,  SpriteView.Side),
        ["pounce"]  = new SpriteClip("pounce",  4.5, true,  SpriteView.Side),
        ["eat"]     = new SpriteClip("eat",     3.0, true,  SpriteView.Side),
        // stationary clips ship 4 subtle-varation frames
        ["sit"]     = new SpriteClip("sit",     2.2, true,  SpriteView.Front),
        ["sleep"]   = new SpriteClip("sleep",   1.4, true,  SpriteView.Side),
        ["idle"]    = new SpriteClip("idle",    1.8, true,  SpriteView.Side),
        ["happy"]   = new SpriteClip("happy",   4.5, true,  SpriteView.Front),
        ["angry"]   = new SpriteClip("angry",   3.2, true,  SpriteView.Front),
        ["dangle"]  = new SpriteClip("dangle",  2.4, true,  SpriteView.Front),
    };

    /// <summary>Primary clip for each state.</summary>
    public static SpriteClip ClipFor(CatState state) => state switch
    {
        CatState.Walking => Clips["walk"],
        CatState.Running or CatState.ChasingCursor => Clips["run"],
        CatState.Jumping => Clips["jump"],
        CatState.Dancing => Clips["dance"],
        CatState.Scratching or CatState.ScratchAttack => Clips["scratch"],
        CatState.Sitting => Clips["sit"],
        CatState.Sleeping => Clips["sleep"],
        CatState.Idle => Clips["idle"],
        CatState.Petted => Clips["happy"],
        CatState.FeedHappy => Clips["eat"],
        CatState.Angry => Clips["angry"],
        CatState.Dragged => Clips["dangle"],
        CatState.PlayingYarn => Clips["pounce"],
        _ => Clips["idle"],
    };

    /// <summary>
    /// The default breed has every clip generated at high frame counts (8 motion / 4 stationary).
    /// Other breeds ship walk + sit + scratch (the most-seen clips). Every other action resolves
    /// through a look-alike re-use so any breed can do anything.
    /// </summary>
    public static ResolvedClip Resolve(string breedId, CatState state)
    {
        var breed = SkinCatalog.Breed(breedId) is { } b ? b.Id : DefaultBreed;
        var clip = ClipFor(state);

        // default breed has every clip generated
        if (breed == DefaultBreed || HasClip(breed, clip.Name))
            return new ResolvedClip(breed, clip);

        // look-alike re-use within the breed's own folder
        var (reused, speed) = state switch
        {
            CatState.Running or CatState.ChasingCursor => ("walk", 1.5),
            CatState.Idle => ("walk", 0.75),
            CatState.Jumping => ("walk", 1.2),
            CatState.PlayingYarn => ("walk", 1.1),
            CatState.Sleeping => ("sit", 0.7),
            CatState.Dancing => ("sit", 2.6),
            CatState.Petted or CatState.FeedHappy => ("sit", 2.4),
            CatState.Angry => ("scratch", 0.55),
            CatState.Dragged => ("sit", 1.0),
            CatState.Scratching or CatState.ScratchAttack => ("walk", 1.0),
            _ => ("walk", 1.0),
        };
        return new ResolvedClip(breed, clip with { Name = reused, Fps = clip.Fps * speed });
    }

    /// <summary>Relative paths (vs app base dir) of every frame of the resolved clip.</summary>
    public static IReadOnlyList<string> FrameFiles(ResolvedClip rc)
    {
        var count = FrameCount(rc.BreedId, rc.Clip.Name);
        var list = new List<string>(count);
        for (var i = 0; i < count; i++)
            list.Add($"Assets/sprites/{rc.BreedId}/{rc.Clip.Name}/frame_{i:00}.png");
        return list;
    }

    public static string FrameFile(ResolvedClip rc, int index)
    {
        var count = Math.Max(1, FrameCount(rc.BreedId, rc.Clip.Name));
        var i = rc.Clip.Loop ? ((index % count) + count) % count : Math.Clamp(index, 0, count - 1);
        return $"Assets/sprites/{rc.BreedId}/{rc.Clip.Name}/frame_{i:00}.png";
    }

    /// <summary>Frame count from the catalog (validated against disk by tests and the host).</summary>
    public static int FrameCount(string breedId, string clipName)
    {
        if (_frameCounts.TryGetValue((breedId, clipName), out var n)) return n;
        return KnownGenerated(breedId, clipName);
    }

    /// <summary>Host registers the real frame counts it finds on disk at startup.</summary>
    public static void RegisterFrameCount(string breedId, string clipName, int count)
    {
        if (count > 0) _frameCounts[(breedId, clipName)] = count;
    }

    private static readonly Dictionary<(string, string), int> _frameCounts = new();

    /// <summary>Which clips were actually AI-generated for which breed (design-time knowledge).</summary>
    public static bool HasClip(string breedId, string clipName) =>
        breedId == DefaultBreed
        || clipName is "walk" or "sit" or "scratch";

    private static int KnownGenerated(string breedId, string clipName)
    {
        if (breedId != DefaultBreed)
            return !HasClip(breedId, clipName) ? 0 : clipName is "sit" ? 2 : 4;
        // default breed: 8 frames for motion clips, 4 for stationary ones
        return clipName is "walk" or "run" or "jump" or "dance" or "scratch" ? 8 : 4;
    }

    /// <summary>Design-time frame count for a (breed, clip) pair — exposed for asset integrity tests.</summary>
    public static int KnownGeneratedCounts(string breedId, string clipName) => KnownGenerated(breedId, clipName);

    /// <summary>Every (breed, clip) pair the app may ever request — for asset integrity tests.</summary>
    public static IEnumerable<(string BreedId, string ClipName)> AllRequiredAssets()
    {
        foreach (var b in SkinCatalog.Breeds)
        foreach (var state in new[]
                 {
                     CatState.Idle, CatState.Walking, CatState.Running, CatState.Sitting, CatState.Sleeping,
                     CatState.Dancing, CatState.Jumping, CatState.PlayingYarn, CatState.Scratching,
                     CatState.Petted, CatState.Dragged, CatState.FeedHappy, CatState.Angry,
                     CatState.ScratchAttack, CatState.ChasingCursor
                 })
        {
            var rc = Resolve(b.Id, state);
            yield return (rc.BreedId, rc.Clip.Name);
        }
    }
}
