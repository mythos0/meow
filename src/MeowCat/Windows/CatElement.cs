// CatElement.cs — the FrameworkElement that renders the cat every frame by
// building a Core display list and replaying it. One visual, one stream —
// no sprites, no bitmaps, tiny memory footprint.

namespace MeowCat.Windows;

using System.Windows;
using System.Windows.Media;
using MeowCat.Core.Brain;
using MeowCat.Core.Data;
using MeowCat.Core.Render;
using MeowCat.Rendering;

public sealed class CatElement : FrameworkElement
{
    private readonly WpfReplay _replay = new();
    private CatBrain? _brain;
    private string _breed = "grey_tabby";
    private double _scale = 1.0;
    private double _alpha = 1.0;

    // reminder bubble state
    public string? BubbleText { get; set; }
    public DateTime BubbleUntil { get; set; }

    public void Configure(CatBrain brain, string breed, double scale, double alpha)
    {
        _brain = brain;
        _breed = breed;
        _scale = scale;
        _alpha = alpha;
    }

    public void SetBreed(string breed) { _breed = breed; }
    public void SetScale(double s) { _scale = s; }
    public void SetAlpha(double a) { _alpha = a; }

    /// <summary>Hit test in screen DIU against the cat bounding box.</summary>
    public bool HitTest(double mx, double my)
    {
        if (_brain == null) return false;
        var (x, y, _, dir, _, _) = _brain.Pose;
        double s = _scale;
        double x0 = x + Catalog.BboxX * s * (dir >= 0 ? 1 : -1);
        double x1 = x + (Catalog.BboxX + Catalog.BboxW) * s * (dir >= 0 ? 1 : -1);
        double y0 = y + Catalog.BboxY * s;
        double y1 = y + Catalog.BboxH * s;
        if (x0 > x1) (x0, x1) = (x1, x0);
        return mx >= x0 && mx <= x1 && my >= y0 && my <= y1;
    }

    protected override void OnRender(DrawingContext dc)
    {
        if (_brain == null) return;
        var pose = _brain.Pose;

        dc.PushTransform(new TranslateTransform(pose.X, pose.Y));
        var canvas = new Canvas();
        CatArt.DrawCat(canvas, _breed, pose.State, pose.T, pose.Dir, _scale, _alpha, pose.JumpP);
        CatArt.DrawParticles(canvas, _breed, pose.State, pose.T, _scale, pose.JumpP);

        // contextual emote floating just above the head (v3.2 anchor fix);
        // the brain sets Emote on state entries and interactions (pet→love…)
        if (_brain.Emote.HasValue)
        {
            double age = _brain.T - _brain.Emote.Value.T0;
            if (age >= 0 && age < 2)
            {
                var (ex, ey) = CatArt.EmoteAnchor(_breed);
                CatArt.DrawEmote(canvas, _brain.Emote.Value.Kind, age, ex, ey, _scale);
            }
            else _brain.Emote = null;
        }
        _replay.Replay(canvas.Ops, dc);
        dc.Pop();

        DrawBubble(dc);
    }

    private void DrawBubble(DrawingContext dc)
    {
        if (string.IsNullOrEmpty(BubbleText) || DateTime.UtcNow > BubbleUntil) return;

        const double dip = 1.0;
        var face = new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Regular, FontStretches.Normal);
        var ft = new FormattedText(BubbleText, System.Globalization.CultureInfo.InvariantCulture,
            FlowDirection.LeftToRight, face, 14, new SolidColorBrush(Color.FromRgb(0xff, 0xe9, 0xc8)), dip);
        double w = Math.Min(260, ft.Width + 24);
        double h = ft.Height + 18;
        var pose = _brain!.Pose;
        double bx = Math.Max(10, pose.X - 20 - w / 2);
        double by = Math.Max(10, pose.Y - 150 * _scale - h - 46);

        var bg = new SolidColorBrush(Color.FromArgb(235, 22, 24, 30));
        var border = new SolidColorBrush(Color.FromRgb(0x3a, 0x3f, 0x4b));
        bg.Freeze(); border.Freeze();
        var rect = new Rect(bx, by, w, h);
        dc.DrawRoundedRectangle(bg, new Pen(border, 1), rect, 12, 12);
        // tail triangle
        var tri = new StreamGeometry();
        using (var g = tri.Open())
        {
            g.BeginFigure(new Point(bx + 24, by + h - 1), true, true);
            g.LineTo(new Point(bx + 32, by + h + 8), true, false);
            g.LineTo(new Point(bx + 40, by + h - 1), true, false);
        }
        tri.Freeze();
        dc.DrawGeometry(bg, new Pen(border, 1), tri);
        dc.DrawText(ft, new Point(bx + 12, by + 8));
    }
}
