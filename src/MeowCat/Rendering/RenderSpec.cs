using System.Collections.Generic;
using System.Windows.Media;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>Everything the renderer needs to draw one frame. Immutable snapshot.</summary>
public sealed class RenderSpec
{
    public CatState State { get; set; } = CatState.Idle;
    public double Time { get; set; }              // seconds inside current state
    public int Facing { get; set; } = 1;
    public double Scale { get; set; } = 1.0;      // user size 0.5–2.0
    public string BreedId { get; set; } = "orange_tabby";
    public BreedColors Breed { get; set; } = SkinCatalog.Breed("orange_tabby")!.Colors;
    public IReadOnlyList<string> Accessories { get; set; } = System.Array.Empty<string>();
    public string EmotePack { get; set; } = "hearts";
    public double AirHeight { get; set; }         // px above the floor while airborne
    public double JumpPhase { get; set; }         // 0..1 within a jump
    public double Vy { get; set; }                // vertical velocity (px/s, +down)
    public double CanvasW { get; set; } = 210;
    public double CanvasH { get; set; } = 190;
}

/// <summary>Frozen WPF brushes for one breed — cached per breed id (alloc-free at 60 fps).</summary>
public sealed class CatPalette
{
    public SolidColorBrush BodyLight = null!;
    public SolidColorBrush BodyDark = null!;
    public RadialGradientBrush BodyGradient = null!;
    public RadialGradientBrush HeadGradient = null!;
    public SolidColorBrush Belly = null!;
    public SolidColorBrush Stripe = null!;
    public RadialGradientBrush Iris = null!;
    public SolidColorBrush Nose = null!;
    public readonly SolidColorBrush Liner = Frozen("#FF2A2027");
    public readonly SolidColorBrush Pupil = Frozen("#FF171018");
    public readonly SolidColorBrush Catchlight = Frozen("#FFFFFFFF");
    public readonly SolidColorBrush Whisker = Frozen("#88FFFFFF");
    public readonly SolidColorBrush Shadow = Frozen("#28000000");
    public readonly SolidColorBrush Blush = Frozen("#66FF8FA0");
    public readonly SolidColorBrush AOFade = Frozen("#22000000");
    public SolidColorBrush? PawTip;   // white socks (tuxedo) / dark points (siamese) / null

    public static CatPalette Get(BreedColors c)
    {
        var key = c.BodyLight + c.BodyDark + c.Belly + c.Stripe + c.EyeOuter + c.EyeInner + c.Nose;
        if (_cache.TryGetValue(key, out var p)) return p;
        p = Build(c);
        _cache[key] = p;
        return p;
    }

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, CatPalette> _cache = new();

    private static CatPalette Build(BreedColors c)
    {
        var light = Frozen(c.BodyLight);
        var dark = Frozen(c.BodyDark);
        var p = new CatPalette
        {
            BodyLight = light,
            BodyDark = dark,
            BodyGradient = Radial(light, dark, 0.38, 0.30),
            HeadGradient = Radial(light, dark, 0.40, 0.32),
            Belly = Frozen(c.Belly),
            Stripe = Frozen(c.Stripe),
            Iris = Radial(Frozen(c.EyeInner), Frozen(c.EyeOuter), 0.42, 0.38),
            Nose = Frozen(c.Nose),
        };
        p.PawTip = c.Pattern switch
        {
            FurPattern.Tuxedo => p.Belly,
            FurPattern.Points => p.Stripe,
            _ => null,
        };
        return p;
    }

    private static RadialGradientBrush Radial(GradientStopCollection stops, double cx, double cy)
    {
        var b = new RadialGradientBrush(stops)
        {
            Center = new System.Windows.Point(cx, cy),
            GradientOrigin = new System.Windows.Point(cx, cy),
            RadiusX = 0.85, RadiusY = 0.85,
        };
        b.Freeze();
        return b;
    }

    private static RadialGradientBrush Radial(Brush inner, Brush outer, double cx, double cy)
    {
        var b = new RadialGradientBrush(
            new GradientStopCollection
            {
                new GradientStop(((SolidColorBrush)inner).Color, 0.0),
                new GradientStop(((SolidColorBrush)outer).Color, 1.0),
            })
        {
            Center = new System.Windows.Point(cx, cy),
            GradientOrigin = new System.Windows.Point(cx, cy),
            RadiusX = 0.85, RadiusY = 0.85,
        };
        b.Freeze();
        return b;
    }

    public static SolidColorBrush Frozen(string hex)
    {
        var key = hex;
        if (_solid.TryGetValue(key, out var b)) return b;
        b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        b.Freeze();
        _solid[key] = b;
        return b;
    }

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, SolidColorBrush> _solid = new();
}
