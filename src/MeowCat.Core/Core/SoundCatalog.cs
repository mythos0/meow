using System.Collections.Generic;
using System.Linq;

namespace MeowCat.Core;

/// <summary>Central map of which sound plays when. File names relative to Assets/sounds.</summary>
public static class SoundCatalog
{
    public const string Meow = "meow.wav";
    public const string Purr = "purr.wav";
    public const string Patter = "patter.wav";
    public const string RunPatter = "run_patter.wav";
    public const string Whoosh = "whoosh.wav";
    public const string Land = "land.wav";
    public const string Coin = "coin.wav";
    public const string Scratch = "scratch.wav";
    public const string Chirp = "chirp.wav";
    public const string DanceLoop = "dance_loop.wav";

    /// <summary>One-shot sound played when the state begins (null = silent entry).</summary>
    public static string? EntryFor(CatState s) => s switch
    {
        CatState.Sleeping => Purr,
        CatState.Dancing => DanceLoop,
        CatState.Jumping => Whoosh,
        CatState.Petted => Purr,
        CatState.FeedHappy => Meow,
        CatState.Scratching => Scratch,
        _ => null
    };

    /// <summary>Looping/stepping sounds while a state persists (played on a cadence by the host).</summary>
    public static string? LoopFor(CatState s) => s switch
    {
        CatState.Walking => Patter,
        CatState.Running or CatState.ChasingCursor => RunPatter,
        CatState.Sleeping => Purr,
        CatState.Dancing => DanceLoop,
        CatState.Scratching => Scratch,
        _ => null
    };

    /// <summary>Recommended re-play interval for the looping sound (seconds).</summary>
    public static double LoopIntervalFor(CatState s) => s switch
    {
        CatState.Walking => 0.45,
        CatState.Running or CatState.ChasingCursor => 0.26,
        CatState.Sleeping => 2.6,
        CatState.Dancing => 2.15,
        CatState.Scratching => 1.1,
        _ => 1.0
    };

    /// <summary>Every file name the catalog can ever request.</summary>
    public static IEnumerable<string> AllFiles() =>
        new[] { Meow, Purr, Patter, RunPatter, Whoosh, Land, Coin, Scratch, Chirp, DanceLoop }.Distinct();
}
