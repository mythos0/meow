using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>
/// Draws store accessories on top of the photorealistic sprite frames. Anchors are expressed
/// in art-box fractions, with per-view variants (side-view clips face right, front clips face
/// the camera), so hats sit on the head and scarves on the neck in every pose.
/// </summary>
public static class SpriteFx
{
    private static readonly Brush HatRed = CatPalette.Frozen("#FFE0566B");
    private static readonly Brush HatDark = CatPalette.Frozen("#FF2E3440");
    private static readonly Brush HatGold = CatPalette.Frozen("#FFF2C94C");
    private static readonly Brush BowPink = CatPalette.Frozen("#FFF48FB1");
    private static readonly Brush ScarfRed = CatPalette.Frozen("#FFD95A50");
    private static readonly Brush FrameMetal = CatPalette.Frozen("#CC3B3B44");
    private static readonly Brush GlassTint = CatPalette.Frozen("#4CDCEFFF");
    private static readonly Brush Outline = CatPalette.Frozen("#66000000");

    /// <summary>Anchor = (x, y, size) in art-box fractions for the current clip view.</summary>
    private static (double X, double Y, double S) HeadAnchor(SpriteView view, Rect box)
    {
        return view == SpriteView.Side
            ? (box.X + box.Width * 0.70, box.Y + box.Height * 0.20, box.Width * 0.34)
            : (box.X + box.Width * 0.50, box.Y + box.Height * 0.17, box.Width * 0.36);
    }

    private static (double X, double Y, double S) NeckAnchor(SpriteView view, Rect box)
    {
        return view == SpriteView.Side
            ? (box.X + box.Width * 0.55, box.Y + box.Height * 0.40, box.Width * 0.30)
            : (box.X + box.Width * 0.50, box.Y + box.Height * 0.38, box.Width * 0.34);
    }

    public static void Render(DrawingContext dc, RenderSpec spec, SpriteView view, Rect box)
    {
        foreach (var acc in spec.Accessories)
        {
            switch (acc)
            {
                case "party_hat": DrawPartyHat(dc, view, box); break;
                case "top_hat": DrawTopHat(dc, view, box); break;
                case "head_bow": DrawHeadBow(dc, view, box); break;
                case "bow_tie": DrawBowTie(dc, view, box); break;
                case "glasses": DrawGlasses(dc, view, box); break;
                case "scarf": DrawScarf(dc, view, box); break;
            }
        }
    }

    private static void DrawPartyHat(DrawingContext dc, SpriteView view, Rect box)
    {
        var (hx, hy, s) = HeadAnchor(view, box);
        var cx = hx;
        var baseY = hy - s * 0.28;
        var tipY = baseY - s * 0.62;
        var half = s * 0.30;

        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            ctx.BeginFigure(new Point(cx - half, baseY), true, true);
            ctx.LineTo(new Point(cx + half, baseY), true, true);
            ctx.LineTo(new Point(cx, tipY), true, true);
        }
        dc.DrawGeometry(HatRed, new Pen(Outline, 1.2), g);
        // stripes + pom
        dc.DrawEllipse(HatGold, null, new Point(cx, tipY), s * 0.07, s * 0.07);
        var stripe = new Pen(HatGold, 2.4);
        dc.DrawLine(stripe, new Point(cx - half * 0.62, baseY - s * 0.20), new Point(cx + half * 0.10, baseY - s * 0.20));
        dc.DrawLine(stripe, new Point(cx - half * 0.36, baseY - s * 0.40), new Point(cx + half * 0.02, baseY - s * 0.40));
    }

    private static void DrawTopHat(DrawingContext dc, SpriteView view, Rect box)
    {
        var (hx, hy, s) = HeadAnchor(view, box);
        var cx = hx;
        var brimY = hy - s * 0.26;
        var crownH = s * 0.52;
        var crownW = s * 0.44;
        var brimW = s * 0.66;

        dc.DrawRoundedRectangle(HatDark, new Pen(Outline, 1.2),
            new Rect(cx - brimW / 2, brimY, brimW, s * 0.06), 2, 2);
        dc.DrawRoundedRectangle(HatDark, new Pen(Outline, 1.2),
            new Rect(cx - crownW / 2, brimY - crownH, crownW, crownH), 3, 3);
        dc.DrawRoundedRectangle(HatRed, null,
            new Rect(cx - crownW / 2, brimY - crownH * 0.42, crownW, crownH * 0.14), 1, 1);
    }

    private static void DrawHeadBow(DrawingContext dc, SpriteView view, Rect box)
    {
        var (hx, hy, s) = HeadAnchor(view, box);
        var cx = view == SpriteView.Side ? hx - s * 0.30 : hx + s * 0.34;
        var cy = hy - s * 0.12;
        var r = s * 0.16;

        var left = new StreamGeometry();
        using (var ctx = left.Open())
        {
            ctx.BeginFigure(new Point(cx, cy), true, true);
            ctx.LineTo(new Point(cx - r * 1.4, cy - r * 0.9), true, true);
            ctx.QuadraticBezierTo(new Point(cx - r * 1.8, cy), new Point(cx - r * 1.4, cy + r * 0.9), true, true);
        }
        var right = new StreamGeometry();
        using (var ctx = right.Open())
        {
            ctx.BeginFigure(new Point(cx, cy), true, true);
            ctx.LineTo(new Point(cx + r * 1.4, cy - r * 0.9), true, true);
            ctx.QuadraticBezierTo(new Point(cx + r * 1.8, cy), new Point(cx + r * 1.4, cy + r * 0.9), true, true);
        }
        dc.DrawGeometry(BowPink, new Pen(Outline, 1.1), left);
        dc.DrawGeometry(BowPink, new Pen(Outline, 1.1), right);
        dc.DrawEllipse(BowPink, new Pen(Outline, 1.1), new Point(cx, cy), r * 0.42, r * 0.42);
    }

    private static void DrawBowTie(DrawingContext dc, SpriteView view, Rect box)
    {
        var (nx, ny, s) = NeckAnchor(view, box);
        var cx = view == SpriteView.Side ? nx + s * 0.10 : nx;
        var cy = ny + s * 0.06;
        var r = s * 0.15;

        var wing = (double dx) =>
        {
            var g = new StreamGeometry();
            using (var ctx = g.Open())
            {
                ctx.BeginFigure(new Point(cx, cy), true, true);
                ctx.LineTo(new Point(cx + dx, cy - r * 0.8), true, true);
                ctx.QuadraticBezierTo(new Point(cx + dx * 1.15, cy), new Point(cx + dx, cy + r * 0.8), true, true);
            }
            dc.DrawGeometry(HatRed, new Pen(Outline, 1.1), g);
        };
        wing(-r * 1.5);
        wing(r * 1.5);
        dc.DrawRoundedRectangle(HatRed, new Pen(Outline, 1.1), new Rect(cx - r * 0.3, cy - r * 0.3, r * 0.6, r * 0.6), 2, 2);
    }

    private static void DrawGlasses(DrawingContext dc, SpriteView view, Rect box)
    {
        var (hx, hy, s) = HeadAnchor(view, box);
        var cy = view == SpriteView.Side ? hy + s * 0.10 : hy + s * 0.16;
        var r = s * 0.13;
        var pen = new Pen(FrameMetal, 2.6);

        if (view == SpriteView.Side)
        {
            var cx = hx + s * 0.06;
            dc.DrawEllipse(GlassTint, pen, new Point(cx, cy), r, r);
            dc.DrawLine(pen, new Point(cx + r, cy), new Point(hx + s * 0.30, cy - s * 0.02));
        }
        else
        {
            var dx = r * 1.25;
            dc.DrawEllipse(GlassTint, pen, new Point(hx - dx, cy), r, r);
            dc.DrawEllipse(GlassTint, pen, new Point(hx + dx, cy), r, r);
            dc.DrawLine(pen, new Point(hx - dx + r, cy), new Point(hx + dx - r, cy));
        }
    }

    private static void DrawScarf(DrawingContext dc, SpriteView view, Rect box)
    {
        var (nx, ny, s) = NeckAnchor(view, box);
        var cy = ny + s * 0.10;
        var w = s * 0.46;
        var h = s * 0.13;
        var cx = view == SpriteView.Side ? nx + s * 0.08 : nx;

        dc.DrawRoundedRectangle(ScarfRed, new Pen(Outline, 1.1),
            new Rect(cx - w / 2, cy - h / 2, w, h), h / 2, h / 2);
        // dangling tail
        var tail = new Rect(cx + w * 0.12, cy + h * 0.2, w * 0.22, h * 1.9);
        dc.DrawRoundedRectangle(ScarfRed, new Pen(Outline, 1.1), tail, 4, 4);
    }
}
