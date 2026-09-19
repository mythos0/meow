using System;
using System.Windows.Media;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>Everything the renderer needs to draw one sprite frame. Immutable snapshot.</summary>
public sealed class RenderSpec
{
    public CatState State { get; set; } = CatState.Idle;
    public double Time { get; set; }              // seconds inside current state
    public int Facing { get; set; } = 1;
    public double Scale { get; set; } = 1.0;      // user size 0.5–2.0
    public string BreedId { get; set; } = SpriteCatalog.DefaultBreed;
    public IReadOnlyList<string> Accessories { get; set; } = Array.Empty<string>();
    public string EmotePack { get; set; } = "hearts";
    public double AirHeight { get; set; }         // DIU above the floor while airborne (shadow shrink)
    public double ArtTop { get; set; }            // top offset of the art box inside the canvas (emote headroom)
    public double CanvasW { get; set; } = 460;
    public double CanvasH { get; set; } = 460;
    public string? SpeechText { get; set; }       // reminder/notification bubble headline
    public string? SpeechMessage { get; set; }    // optional second line
    public double SpeechElapsed { get; set; }     // seconds since the bubble appeared
}

/// <summary>Frozen WPF brushes — shared by the emote renderer and store UI (cached per hex).</summary>
public sealed class CatPalette
{
    public readonly SolidColorBrush Liner = Frozen("#FF2A2027");
    public readonly SolidColorBrush Pupil = Frozen("#FF171018");
    public readonly SolidColorBrush Catchlight = Frozen("#FFFFFFFF");
    public readonly SolidColorBrush Whisker = Frozen("#88FFFFFF");
    public readonly SolidColorBrush Shadow = Frozen("#28000000");
    public readonly SolidColorBrush Blush = Frozen("#66FF8FA0");

    public static SolidColorBrush Frozen(string hex)
    {
        if (_solid.TryGetValue(hex, out var b)) return b;
        b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        b.Freeze();
        _solid[hex] = b;
        return b;
    }

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, SolidColorBrush> _solid = new();
}
