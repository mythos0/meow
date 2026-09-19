using System;
using System.Collections.Generic;
using System.Linq;

namespace MeowCat.Core;

/// <summary>
/// Central map of which sound plays when. File names relative to Assets/sounds.
/// v2: real recorded cat sounds (meow / purr / hiss / growl / glass break) are used
/// alongside the subtle synthesized foley (footsteps, whoosh, coins).
/// </summary>
public static class SoundCatalog
{
    // ---- real recorded sounds (downloaded, see docs/SOUND_CREDITS.md) ----
    public const string MeowReal = "meow_real.wav";
    public const string MeowReal2 = "meow_real2.wav";
    public const string MeowReal3 = "meow_real3.wav";
    public const string PurrReal = "purr_real.wav";
    public const string HissReal = "hiss_real.wav";
    public const string GrowlReal = "growl_real.wav";
    public const string GlassReal = "glass_real.wav";

    // ---- synthesized foley (subtle, kept from v1) ----
    public const string Patter = "patter.wav";
    public const string RunPatter = "run_patter.wav";
    public const string Whoosh = "whoosh.wav";
    public const string Land = "land.wav";
    public const string Coin = "coin.wav";
    public const string ScratchFoley = "scratch.wav";
    public const string Chirp = "chirp.wav";
    public const string DanceLoop = "dance_loop.wav";

    private static readonly string[] MeowVariants = { MeowReal, MeowReal2, MeowReal3 };

    /// <summary>Random real meow (three pitch variants keep it from getting repetitive).</summary>
    public static string RandomMeow(Random rng) => MeowVariants[rng.Next(MeowVariants.Length)];

    /// <summary>One-shot sound played when the state begins (null = silent entry).</summary>
    public static string? EntryFor(CatState s, Random rng)
    {
        switch (s)
        {
            case CatState.Sleeping: return PurrReal;
            case CatState.Dancing: return DanceLoop;
            case CatState.Jumping: return Whoosh;
            case CatState.Petted: return PurrReal;
            case CatState.FeedHappy: return Chirp;
            case CatState.Scratching: return ScratchFoley;
            case CatState.Angry: return GrowlReal;
            case CatState.ScratchAttack: return HissReal;
            default: return null;
        }
    }

    /// <summary>Looping/stepping sounds while a state persists (played on a cadence by the host).</summary>
    public static string? LoopFor(CatState s) => s switch
    {
        CatState.Walking => Patter,
        CatState.Running or CatState.ChasingCursor => RunPatter,
        CatState.Sleeping => PurrReal,
        CatState.Dancing => DanceLoop,
        CatState.Scratching => ScratchFoley,
        CatState.Angry => GrowlReal,
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
        CatState.Angry => 3.4,
        _ => 1.0
    };

    /// <summary>Every file name the catalog can ever request.</summary>
    public static IEnumerable<string> AllFiles()
    {
        var list = new List<string>
        {
            MeowReal, MeowReal2, MeowReal3, PurrReal, HissReal, GrowlReal, GlassReal,
            Patter, RunPatter, Whoosh, Land, Coin, ScratchFoley, Chirp, DanceLoop
        };
        return list.Distinct();
    }
}
