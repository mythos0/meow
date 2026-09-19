using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>
/// Draws the fully shaded cat: layered radial gradients for volume, ambient occlusion,
/// specular highlights, fur patterns, all 13 poses, accessories and state effects.
/// Everything is painted in a 210×190 canvas whose feet line is y=160.
/// </summary>
public static partial class CatPainter
{
    // ---- geometry constants (local canvas space, facing +x) ----
    private const double BodyCX = 100, BodyCY = 118, BodyRX = 46, BodyRY = 30;
    private const double HipY = 132, LegW = 13, LegH = 34, FootY = 160;
    private const double HipFL = 122, HipFR = 136, HipBL = 76, HipBR = 90;
    private const double TailBX = 58, TailBY = 112, TailLen = 55;

    public static void Paint(DrawingContext dc, RenderSpec spec, Pose pose)
    {
        var pal = CatPalette.Get(spec.Breed);
        var s = spec.Scale;

        dc.PushTransform(new ScaleTransform(s, s));

        // ground shadow (unflipped — centered on the cat)
        var shrink = pose.ShadowShrink;
        dc.DrawEllipse(pal.Shadow, null, new Point(105, 162.5), 54 * shrink, 7.5 * shrink);

        dc.PushTransform(new ScaleTransform(spec.Facing, 1, 105, 0));

        if (spec.Breed.Pattern == FurPattern.Fluffy) PaintFluffHalo(dc, pal);

        PaintTail(dc, pal, spec.Breed.Pattern, pose);
        PaintLeg(dc, pal, HipBL, pose.LegBL, back: true);
        PaintLeg(dc, pal, HipBR, pose.LegBR, back: true);
        PaintBody(dc, pal, spec, pose);
        PaintNeckwear(dc, pal, spec, pose);           // scarf / bow tie sit under the chin
        PaintLeg(dc, pal, HipFL, pose.LegFL, back: false);
        PaintLeg(dc, pal, HipFR, pose.LegFR, back: false);
        PaintHead(dc, pal, spec, pose);

        dc.Pop(); // facing flip

        PaintStateFx(dc, spec, pose);                 // yarn / scratch marks (flip-safe-ish)
        PaintEmotes(dc, spec, pose);

        dc.Pop(); // user scale
    }

    // ------------------------------------------------------------------ body

    private static void PaintBody(DrawingContext dc, CatPalette pal, RenderSpec spec, Pose pose)
    {
        dc.PushTransform(new TranslateTransform(pose.BodyDx, pose.BodyDy));
        dc.PushTransform(new RotateTransform(pose.BodyRot, BodyCX, BodyCY));
        dc.PushTransform(new ScaleTransform(1, pose.BodySquash, BodyCX, FootY));

        // torso with radial volume gradient
        dc.DrawEllipse(pal.BodyGradient, null, new Point(BodyCX, BodyCY), BodyRX, BodyRY);
        // belly patch
        dc.DrawEllipse(pal.Belly, null, new Point(BodyCX - 2, BodyCY + 12), BodyRX * 0.62, BodyRY * 0.52);
        // ambient occlusion under the chin
        dc.DrawEllipse(pal.AOFade, null, new Point(BodyCX + 10, BodyCY - 18), 24, 7);
        PaintPattern(dc, pal, spec);
        // chest fur tufts
        PaintTufts(dc, pal);

        dc.Pop(); dc.Pop(); dc.Pop();
    }

    private static void PaintPattern(DrawingContext dc, CatPalette pal, RenderSpec spec)
    {
        switch (spec.Breed.Pattern)
        {
            case FurPattern.Tabby:
            {
                var pen = new Pen(pal.Stripe, 7) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                dc.PushOpacity(0.75);
                dc.DrawLine(pen, new Point(68, 104), new Point(80, 96));
                dc.DrawLine(pen, new Point(94, 98), new Point(104, 90));
                dc.DrawLine(pen, new Point(118, 100), new Point(128, 93));
                dc.DrawLine(pen, new Point(52, 116), new Point(66, 112));
                dc.Pop();
                break;
            }
            case FurPattern.Calico:
            {
                dc.PushOpacity(0.92);
                dc.DrawEllipse(pal.Stripe, null, new Point(126, 102), 26, 17);          // orange saddle
                var dark = CatPalette.Frozen("#FF6B5B55");
                dc.DrawEllipse(dark, null, new Point(72, 126), 17, 12);                 // charcoal patch
                dc.DrawEllipse(dark, null, new Point(58, 108), 11, 8);
                dc.Pop();
                break;
            }
            case FurPattern.Tuxedo:
            {
                // white chest bib rising up the front
                dc.DrawEllipse(pal.Belly, null, new Point(106, 126), 30, 24);
                break;
            }
            case FurPattern.Points:
            {
                // soft dark saddle along the back
                dc.PushOpacity(0.45);
                dc.DrawEllipse(pal.Stripe, null, new Point(88, 104), 34, 14);
                dc.Pop();
                break;
            }
        }
    }

    private static void PaintTufts(DrawingContext dc, CatPalette pal)
    {
        var b = pal.Belly;
        for (var i = 0; i < 3; i++)
        {
            var x = 84 + i * 11;
            var g = new StreamGeometry();
            using (var ctx = g.Open())
            {
                ctx.BeginFigure(new Point(x, 138), true, true);
                ctx.LineTo(new Point(x + 4.5, 149 + (i == 1 ? 2 : 0)), true, false);
                ctx.LineTo(new Point(x + 9, 138), true, false);
            }
            g.Freeze();
            dc.PushOpacity(0.8);
            dc.DrawGeometry(b, null, g);
            dc.Pop();
        }
    }

    // ------------------------------------------------------------------ legs

    private static void PaintLeg(DrawingContext dc, CatPalette pal, double hipX, double angleDeg, bool back)
    {
        dc.PushTransform(new RotateTransform(angleDeg, hipX, HipY - 6));
        var brush = back ? pal.BodyDark : pal.BodyLight;
        var rect = new Rect(hipX - LegW / 2, HipY - 8, LegW, LegH + 8);
        dc.DrawRoundedRectangle(brush, null, rect, LegW / 2, LegW / 2);
        // paw tip (white socks for tuxedo, dark points for siamese — passed via palette extras)
        if (pal.PawTip is not null)
            dc.DrawRoundedRectangle(pal.PawTip, null, new Rect(hipX - LegW / 2, FootY - 10, LegW, 11), 5.5, 5.5);
        dc.Pop();
    }

    // ------------------------------------------------------------------ tail

    private static void PaintTail(DrawingContext dc, CatPalette pal, FurPattern pattern, Pose pose)
    {
        var a = pose.TailAngle * Math.PI / 180.0;
        var dir = new Vector(-Math.Cos(a), -Math.Sin(a));
        var curl = pose.TailCurl;

        static Vector Rot(Vector v, double deg)
        {
            var r = deg * Math.PI / 180.0;
            var c = Math.Cos(r); var s = Math.Sin(r);
            return new Vector(v.X * c - v.Y * s, v.X * s + v.Y * c);
        }

        var p0 = new Point(TailBX, TailBY);
        var p1 = new Point(TailBX, TailBY) + dir * TailLen * 0.42;
        var p2 = new Point(TailBX, TailBY) + Rot(dir, curl * 85) * (TailLen * 0.78);
        var p3 = new Point(TailBX, TailBY) + Rot(dir, curl * 160) * TailLen;

        var darkTail = pattern == FurPattern.Points;
        var outer = new Pen(darkTail ? pal.Stripe : pal.BodyDark, 11.5)
        { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
        var geo = new StreamGeometry();
        using (var ctx = geo.Open())
        {
            ctx.BeginFigure(p0, false, false);
            ctx.BezierTo(p1, p2, p3, true, false);
        }
        geo.Freeze();
        dc.DrawGeometry(null, outer, geo);

        if (!darkTail)
        {
            var inner = new Pen(pal.BodyLight, 7)
            { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            dc.DrawGeometry(null, inner, geo);
            if (pattern == FurPattern.Tabby) // rings
            {
                var ring = new Pen(pal.Stripe, 11.5);
                foreach (var t in new[] { 0.52, 0.78 })
                {
                    var q0 = Cubic(p0, p1, p2, p3, Math.Clamp(t - 0.06, 0, 1));
                    var q1 = Cubic(p0, p1, p2, p3, Math.Clamp(t + 0.06, 0, 1));
                    dc.DrawLine(ring, q0, q1);
                }
            }
        }
        dc.DrawEllipse(darkTail ? pal.BodyDark : pal.Stripe, null, p3, 5.5, 5.5); // tip
    }

    private static Point Cubic(Point p0, Point p1, Point p2, Point p3, double t)
    {
        var mt = 1 - t;
        var x = mt * mt * mt * p0.X + 3 * mt * mt * t * p1.X + 3 * mt * t * t * p2.X + t * t * t * p3.X;
        var y = mt * mt * mt * p0.Y + 3 * mt * mt * t * p1.Y + 3 * mt * t * t * p2.Y + t * t * t * p3.Y;
        return new Point(x, y);
    }

    // ------------------------------------------------------------------ head

    private static void PaintHead(DrawingContext dc, CatPalette pal, RenderSpec spec, Pose pose)
    {
        var hx = CatRenderer.HeadCX + pose.HeadDx;
        var hy = CatRenderer.HeadCY + pose.HeadDy;

        dc.PushTransform(new TranslateTransform(pose.HeadDx, pose.HeadDy));
        dc.PushTransform(new RotateTransform(pose.HeadRot + pose.HeadBobTilt, CatRenderer.HeadCX, CatRenderer.HeadCY));

        PaintEars(dc, pal, spec);
        dc.DrawEllipse(pal.HeadGradient, null, new Point(CatRenderer.HeadCX, CatRenderer.HeadCY), 40, 38);

        // breed facial pattern
        if (spec.Breed.Pattern == FurPattern.Points)
        {
            dc.PushOpacity(0.85);
            dc.DrawEllipse(pal.Stripe, null, new Point(CatRenderer.HeadCX, CatRenderer.HeadCY + 12), 22, 15);
            dc.Pop();
        }
        else if (spec.Breed.Pattern == FurPattern.Tuxedo)
        {
            dc.DrawEllipse(pal.Belly, null, new Point(CatRenderer.HeadCX, CatRenderer.HeadCY + 17), 15, 10);
        }
        else if (spec.Breed.Pattern == FurPattern.Calico)
        {
            dc.PushOpacity(0.9);
            dc.DrawEllipse(pal.Stripe, null, new Point(CatRenderer.HeadCX - 24, CatRenderer.HeadCY - 20), 13, 9);
            dc.Pop();
        }
        else if (spec.Breed.Pattern == FurPattern.Tabby)
        {
            var pen = new Pen(pal.Stripe, 4.5)
            { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            dc.PushOpacity(0.8);
            var cx = CatRenderer.HeadCX;
            var cy = CatRenderer.HeadCY - 24;
            dc.DrawLine(pen, new Point(cx - 10, cy + 8), new Point(cx - 7, cy - 4));
            dc.DrawLine(pen, new Point(cx, cy + 9), new Point(cx, cy - 5));
            dc.DrawLine(pen, new Point(cx + 10, cy + 8), new Point(cx + 7, cy - 4));
            dc.Pop();
        }

        // specular gloss
        dc.DrawEllipse(CatPalette.Frozen("#18FFFFFF"), null,
            new Point(CatRenderer.HeadCX - 14, CatRenderer.HeadCY - 16), 14, 9);

        PaintFace(dc, pal, spec, pose);
        PaintFacewear(dc, spec);   // glasses / hats / bows ride on the head

        dc.Pop();
        dc.Pop();
    }

    private static void PaintEars(DrawingContext dc, CatPalette pal, RenderSpec spec)
    {
        var cx = CatRenderer.HeadCX;
        var cy = CatRenderer.HeadCY;

        void Ear(double dx, SolidColorBrush outer, bool dark)
        {
            var g = new StreamGeometry();
            using (var ctx = g.Open())
            {
                ctx.BeginFigure(new Point(cx + dx - 22, cy - 12), true, true);
                ctx.LineTo(new Point(cx + dx - 14, cy - 50), true, false);
                ctx.LineTo(new Point(cx + dx + 14, cy - 30), true, false);
            }
            g.Freeze();
            dc.DrawGeometry(outer, null, g);
            var inner = new StreamGeometry();
            using (var ictx = inner.Open())
            {
                ictx.BeginFigure(new Point(cx + dx - 14, cy - 16), true, true);
                ictx.LineTo(new Point(cx + dx - 10, cy - 42), true, false);
                ictx.LineTo(new Point(cx + dx + 8, cy - 28), true, false);
            }
            inner.Freeze();
            dc.PushOpacity(0.85);
            dc.DrawGeometry(CatPalette.Frozen("#FFEEA9B4"), null, inner);
            dc.Pop();
        }

        var points = spec.Breed.Pattern == FurPattern.Points;
        var calico = spec.Breed.Pattern == FurPattern.Calico;
        Ear(-16, calico ? pal.Stripe : points ? pal.Stripe : pal.BodyDark, true);   // far ear
        Ear(16, points ? pal.Stripe : pal.BodyDark, false);                          // near ear
    }

    private static void PaintFace(DrawingContext dc, CatPalette pal, RenderSpec spec, Pose pose)
    {
        var cx = CatRenderer.HeadCX;
        var cy = CatRenderer.HeadCY;
        var eyeY = cy - 2;
        var lx = cx - 15;
        var rx = cx + 15;

        DrawEye(dc, pal, lx, eyeY, pose.Eyes);
        DrawEye(dc, pal, rx, eyeY, pose.Eyes);

        if (pose.Blush)
        {
            dc.DrawEllipse(pal.Blush, null, new Point(lx - 8, eyeY + 13), 7.5, 4.2);
            dc.DrawEllipse(pal.Blush, null, new Point(rx + 8, eyeY + 13), 7.5, 4.2);
        }

        // nose
        var noseY = cy + 12;
        var g = new StreamGeometry();
        using (var ng = g.Open())
        {
            ng.BeginFigure(new Point(cx - 5, noseY), true, true);
            ng.LineTo(new Point(cx + 5, noseY), true, false);
            ng.LineTo(new Point(cx, noseY + 6.5), true, false);
        }
        g.Freeze();
        dc.DrawGeometry(pal.Nose, null, g);
        dc.DrawEllipse(CatPalette.Frozen("#80FFFFFF"), null, new Point(cx - 1.6, noseY + 1.4), 1.5, 1.1);

        // ω mouth
        var pen = new Pen(pal.Liner, 1.9)
        { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
        var mg = new StreamGeometry();
        using (var mctx = mg.Open())
        {
            mctx.BeginFigure(new Point(cx, noseY + 7), false, false);
            mctx.QuadraticBezierTo(new Point(cx - 3.5, noseY + 12.5), new Point(cx - 7, noseY + 9.5), true, false);
            mctx.QuadraticBezierTo(new Point(cx + 3.5, noseY + 12.5), new Point(cx + 7, noseY + 9.5), true, false);
        }
        mg.Freeze();
        dc.DrawGeometry(null, pen, mg);

        // whiskers with a gentle sway
        var sway = Math.Sin((spec.Time * 2.0) % (Math.PI * 2)) * 2.2;
        var wpen = new Pen(pal.Whisker, 1.5);
        dc.PushTransform(new RotateTransform(sway, cx - 30, cy + 8));
        for (var i = -1; i <= 1; i++)
            dc.DrawLine(wpen, new Point(cx - 30, cy + 9), new Point(cx - 56, cy + 4 + i * 6));
        dc.Pop();
        dc.PushTransform(new RotateTransform(-sway, cx + 30, cy + 8));
        for (var i = -1; i <= 1; i++)
            dc.DrawLine(wpen, new Point(cx + 30, cy + 9), new Point(cx + 56, cy + 4 + i * 6));
        dc.Pop();
    }

    private static void DrawEye(DrawingContext dc, CatPalette pal, double x, double y, EyeStyle style)
    {
        switch (style)
        {
            case EyeStyle.Happy: // ^ ^
            {
                var pen = new Pen(pal.Liner, 2.6)
                { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                var g = new StreamGeometry();
                using (var c = g.Open())
                {
                    c.BeginFigure(new Point(x - 8, y + 3), false, false);
                    c.QuadraticBezierTo(new Point(x, y - 7), new Point(x + 8, y + 3), true, false);
                }
                g.Freeze();
                dc.DrawGeometry(null, pen, g);
                break;
            }
            case EyeStyle.Closed or EyeStyle.Blink: // ︶
            {
                var pen = new Pen(pal.Liner, 2.4)
                { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                var g = new StreamGeometry();
                using (var c = g.Open())
                {
                    c.BeginFigure(new Point(x - 8, y - 2), false, false);
                    c.QuadraticBezierTo(new Point(x, y + 5), new Point(x + 8, y - 2), true, false);
                }
                g.Freeze();
                dc.DrawGeometry(null, pen, g);
                break;
            }
            case EyeStyle.Wide:
            {
                dc.DrawEllipse(CatPalette.Frozen("#FFFFFFFF"), null, new Point(x, y), 10.5, 12.5);
                dc.DrawEllipse(pal.Iris, null, new Point(x, y), 8.5, 10.0);
                dc.DrawEllipse(pal.Pupil, null, new Point(x, y + 0.5), 2.6, 4.6);
                dc.DrawEllipse(pal.Catchlight, null, new Point(x - 2.8, y - 3.4), 2.0, 2.0);
                dc.DrawEllipse(CatPalette.Frozen("#B3FFFFFF"), null, new Point(x + 2.6, y + 3.0), 1.1, 1.1);
                dc.DrawEllipse(null, new Pen(pal.Liner, 1.8), new Point(x, y), 10.5, 12.5);
                break;
            }
            default: // Open
            {
                dc.DrawEllipse(pal.Iris, null, new Point(x, y), 8.6, 10.2);
                dc.DrawEllipse(pal.Pupil, null, new Point(x, y + 0.8), 3.3, 5.6);
                dc.DrawEllipse(pal.Catchlight, null, new Point(x - 2.8, y - 3.2), 2.2, 2.2);
                dc.DrawEllipse(CatPalette.Frozen("#B3FFFFFF"), null, new Point(x + 2.6, y + 3.2), 1.2, 1.2);
                dc.DrawEllipse(null, new Pen(pal.Liner, 1.7), new Point(x, y), 8.9, 10.5);
                break;
            }
        }
    }

    // ------------------------------------------------------- fluffy / extras

    private static void PaintFluffHalo(DrawingContext dc, CatPalette pal)
    {
        dc.PushOpacity(0.55);
        for (var i = 0; i < 9; i++)
        {
            var ang = Math.PI * 2 * i / 9.0;
            dc.DrawEllipse(pal.BodyLight, null,
                new Point(CatRenderer.HeadCX + Math.Cos(ang) * 39, CatRenderer.HeadCY + Math.Sin(ang) * 37), 10, 10);
        }
        for (var i = 0; i < 7; i++)
        {
            var ang = Math.PI * 2 * (i + 0.5) / 7.0;
            dc.DrawEllipse(pal.BodyLight, null,
                new Point(BodyCX + Math.Cos(ang) * (BodyRX - 2), BodyCY + Math.Sin(ang) * (BodyRY + 2)), 12, 10);
        }
        dc.Pop();
    }
}
