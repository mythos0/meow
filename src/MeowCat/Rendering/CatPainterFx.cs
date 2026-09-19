using System;
using System.Windows;
using System.Windows.Media;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>
/// CatPainter part 2: accessories (party hat, top hat, head bow, bow tie, glasses, scarf),
/// state effects (yarn ball, scratch marks) and floating emotes.
/// </summary>
public static partial class CatPainter
{
    // ---------------------------------------------------------- accessories

    private static void PaintNeckwear(DrawingContext dc, CatPalette pal, RenderSpec spec, Pose pose)
    {
        var hasScarf = spec.Accessories.Contains("scarf");
        var hasBowTie = spec.Accessories.Contains("bow_tie");
        if (!hasScarf && !hasBowTie) return;

        var ny = 100 + pose.HeadDy * 0.5;
        var nx = 114 + pose.HeadDx * 0.3;

        if (hasScarf)
        {
            var scarf = CatPalette.Frozen("#FFE57373");
            var stripePen = new Pen(CatPalette.Frozen("#66FFFFFF"), 2.2);
            var g = new StreamGeometry();
            using (var ctx = g.Open())
            {
                ctx.BeginFigure(new Point(nx - 32, ny - 4), false, false);
                ctx.QuadraticBezierTo(new Point(nx, ny + 12), new Point(nx + 32, ny - 4), true, false);
            }
            g.Freeze();
            dc.DrawGeometry(null, new Pen(scarf, 13) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round }, g);
            dc.DrawGeometry(null, stripePen, g);
            // hanging tail of the scarf
            dc.PushTransform(new RotateTransform(6, nx + 18, ny));
            dc.DrawRoundedRectangle(scarf, null, new Rect(nx + 12, ny + 2, 13, 24), 5, 5);
            dc.DrawLine(stripePen, new Point(nx + 14, ny + 12), new Point(nx + 23, ny + 12));
            dc.DrawLine(stripePen, new Point(nx + 14, ny + 19), new Point(nx + 23, ny + 19));
            dc.Pop();
        }

        if (hasBowTie)
        {
            var bow = CatPalette.Frozen("#FF3F51B5");
            dc.PushTransform(new RotateTransform(-4, nx, ny + 8));
            Tri(dc, bow, new Point(nx, ny + 8), new Point(nx - 20, ny + 1), new Point(nx - 20, ny + 15));
            Tri(dc, bow, new Point(nx, ny + 8), new Point(nx + 20, ny + 1), new Point(nx + 20, ny + 15));
            dc.DrawEllipse(CatPalette.Frozen("#FF2C3A90"), null, new Point(nx, ny + 8), 4.5, 4.5);
            dc.Pop();
        }
    }

    private static void PaintFacewear(DrawingContext dc, RenderSpec spec)
    {
        var cx = CatRenderer.HeadCX;
        var cy = CatRenderer.HeadCY;
        var acc = spec.Accessories;

        if (acc.Contains("glasses"))
        {
            var lens = CatPalette.Frozen("#22A8D8FF");
            var frame = new Pen(CatPalette.Frozen("#FF37322F"), 2.8);
            dc.DrawEllipse(lens, frame, new Point(cx - 15, cy - 2), 12, 12);
            dc.DrawEllipse(lens, frame, new Point(cx + 15, cy - 2), 12, 12);
            var bridge = new StreamGeometry();
            using (var b = bridge.Open())
            {
                b.BeginFigure(new Point(cx - 4, cy - 4), false, false);
                b.QuadraticBezierTo(new Point(cx, cy - 9), new Point(cx + 4, cy - 4), true, false);
            }
            bridge.Freeze();
            dc.DrawGeometry(null, frame, bridge);
        }

        if (acc.Contains("party_hat"))
        {
            dc.PushTransform(new RotateTransform(-8, cx, cy));
            var cone = new StreamGeometry();
            using (var cctx = cone.Open())
            {
                cctx.BeginFigure(new Point(cx - 20, cy - 22), true, true);
                cctx.LineTo(new Point(cx, cy - 66), true, false);
                cctx.LineTo(new Point(cx + 20, cy - 22), true, false);
            }
            cone.Freeze();
            dc.DrawGeometry(CatPalette.Frozen("#FF7E57C2"), null, cone);
            dc.PushOpacity(0.55);
            dc.DrawLine(new Pen(CatPalette.Frozen("#FFFFFFFF"), 4), new Point(cx - 13, cy - 34), new Point(cx + 13, cy - 34));
            dc.DrawLine(new Pen(CatPalette.Frozen("#FFFFFFFF"), 3), new Point(cx - 7, cy - 48), new Point(cx + 7, cy - 48));
            dc.Pop();
            dc.DrawEllipse(CatPalette.Frozen("#FFFFD54F"), null, new Point(cx, cy - 66), 5.5, 5.5);
            dc.Pop();
        }

        if (acc.Contains("top_hat"))
        {
            dc.PushTransform(new RotateTransform(-7, cx, cy));
            var dark = CatPalette.Frozen("#FF26232B");
            dc.DrawEllipse(dark, null, new Point(cx, cy - 24), 31, 6.5);
            dc.DrawRoundedRectangle(dark, null, new Rect(cx - 17, cy - 62, 34, 40), 4, 4);
            dc.DrawRectangle(CatPalette.Frozen("#FFB03A48"), null, new Rect(cx - 17, cy - 34, 34, 8));
            dc.DrawEllipse(CatPalette.Frozen("#30FFFFFF"), null, new Point(cx - 6, cy - 52), 4, 8);
            dc.Pop();
        }

        if (acc.Contains("head_bow"))
        {
            var bx = cx + 34;
            var by = cy - 26;
            var bow = CatPalette.Frozen("#FFF06292");
            Tri(dc, bow, new Point(bx, by), new Point(bx + 18, by - 9), new Point(bx + 18, by + 9));
            Tri(dc, bow, new Point(bx, by), new Point(bx - 18, by - 9), new Point(bx - 18, by + 9));
            dc.DrawEllipse(CatPalette.Frozen("#FFC2185B"), null, new Point(bx, by), 5, 5);
        }
    }

    private static void ArcPath(DrawingContext dc, Pen pen, double cx, double cy, double rx, double ry, double startDeg, double sweepDeg)
    {
        double Pt(double deg, out double x, out double y)
        {
            var r = deg * Math.PI / 180.0;
            x = cx + Math.Cos(r) * rx; y = cy + Math.Sin(r) * ry;
            return deg;
        }
        Pt(startDeg, out var sx, out var sy);
        Pt(startDeg + sweepDeg, out var ex, out var ey);
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            ctx.BeginFigure(new Point(sx, sy), false, false);
            ctx.ArcTo(new Point(ex, ey), new Size(rx, ry), sweepDeg, sweepDeg > 180, SweepDirection.Clockwise, true, false);
        }
        g.Freeze();
        dc.DrawGeometry(null, pen, g);
    }

    private static void Tri(DrawingContext dc, Brush b, Point a, Point p, Point q)
    {
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            ctx.BeginFigure(a, true, true);
            ctx.LineTo(p, true, false);
            ctx.LineTo(q, true, false);
        }
        g.Freeze();
        dc.DrawGeometry(b, null, g);
    }

    // --------------------------------------------------------- state effects

    private static void PaintStateFx(DrawingContext dc, RenderSpec spec, Pose pose)
    {
        switch (spec.State)
        {
            case CatState.PlayingYarn:
            {
                var roll = Math.Min(spec.Time * 14, 26);
                var bx = 105 + spec.Facing * (58 + roll);
                var by = 147;
                dc.DrawEllipse(pose.ShadowShrink > 0 ? CatPalette.Frozen("#18000000") : null, null,
                    new Point(bx, by + 13), 13, 3);
                var yarn = new RadialGradientBrush(
                    new GradientStopCollection
                    {
                        new GradientStop((Color)ColorConverter.ConvertFromString("#FF8FD3C7"), 0.0),
                        new GradientStop((Color)ColorConverter.ConvertFromString("#FF3E9C8E"), 1.0),
                    })
                { Center = new Point(0.35, 0.3), GradientOrigin = new Point(0.35, 0.3), RadiusX = 0.9, RadiusY = 0.9 };
                yarn.Freeze();
                dc.DrawEllipse(yarn, null, new Point(bx, by), 13, 13);
                var strand = new Pen(CatPalette.Frozen("#662E7568"), 1.6);
                ArcPath(dc, strand, bx - 11, by - 4, 10, 7, 200, 160);
                ArcPath(dc, strand, bx - 2, by + 2, 11, 9, 20, 150);
                var thread = new StreamGeometry();
                using (var t = thread.Open())
                {
                    t.BeginFigure(new Point(bx - 12, by + 8), false, false);
                    t.QuadraticBezierTo(new Point(bx - spec.Facing * 30, by + 14), new Point(bx - spec.Facing * 52, by + 10), true, false);
                }
                thread.Freeze();
                dc.DrawGeometry(null, new Pen(CatPalette.Frozen("#FF3E9C8E"), 2), thread);
                break;
            }
            case CatState.Scratching:
            {
                var flick = Math.Abs(Math.Sin(2 * Math.PI * 4.0 * spec.Time));
                var x0 = 105 + spec.Facing * 66;
                dc.PushOpacity(0.25 + 0.45 * flick);
                var pen = new Pen(CatPalette.Frozen("#FF9E9E9E"), 2.6)
                { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                dc.DrawLine(pen, new Point(x0, 58), new Point(x0 + spec.Facing * 5, 118));
                dc.DrawLine(pen, new Point(x0 - spec.Facing * 8, 66), new Point(x0 - spec.Facing * 3, 122));
                dc.DrawLine(pen, new Point(x0 + spec.Facing * 8, 70), new Point(x0 + spec.Facing * 12, 116));
                dc.Pop();
                break;
            }
        }
    }

    private static void PaintEmotes(DrawingContext dc, RenderSpec spec, Pose pose)
    {
        switch (spec.State)
        {
            case CatState.Petted:
                EmoteRenderer.Render(dc, spec.EmotePack, spec.Time, 105, 30, spec.Scale);
                break;
            case CatState.Dancing:
                EmoteRenderer.Render(dc, spec.EmotePack, spec.Time * 1.4, 105, 26, spec.Scale);
                break;
            case CatState.Sleeping:
                EmoteRenderer.Render(dc, "zzz", spec.Time * 0.5, 132, 36, spec.Scale);
                break;
            case CatState.FeedHappy:
                EmoteRenderer.RenderBurst(dc, spec.EmotePack, spec.Time * 0.8, 105, 34, spec.Scale);
                break;
            case CatState.Jumping when pose.Eyes == EyeStyle.Wide && spec.JumpPhase is > 0.05 and < 0.5:
                EmoteRenderer.RenderBurst(dc, spec.EmotePack, spec.JumpPhase * 1.6, 105, 30, spec.Scale);
                break;
        }
    }
}
