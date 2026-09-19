using System;
using System.Globalization;
using System.Windows;
using System.Windows.Media;
using MeowCat.Rendering;

namespace MeowCat.Rendering;

/// <summary>
/// Floating emotion symbols above the cat: hearts / Zzz / notes / ! / sparkles —
/// styled by the equipped emote pack. Plus golden coin popups for the economy.
/// </summary>
public static class EmoteRenderer
{
    private enum Symbol { Heart, Z, Note, Bang, Star }

    private static Symbol ForPack(string pack) => pack switch
    {
        "zzz" => Symbol.Z,
        "music" => Symbol.Note,
        "surprise" => Symbol.Bang,
        "sparkles" => Symbol.Star,
        _ => Symbol.Heart
    };

    /// <summary>Draws a soft ambient emote loop above the cat.</summary>
    public static void Render(DrawingContext dc, string pack, double t, double cx, double cy, double scale = 1.0)
    {
        var sym = ForPack(pack);
        for (var i = 0; i < 3; i++)
        {
            var phase = (t * 0.45 + i / 3.0) % 1.0;
            var x = cx + (i - 1) * 20 + Math.Sin(phase * Math.PI * 2 + i) * 7;
            var y = cy - phase * 52;
            var alpha = phase < 0.15 ? phase / 0.15 : phase > 0.72 ? Math.Max(0, (1 - phase) / 0.28) : 1.0;
            var s = scale * (0.85 + 0.25 * Math.Sin(phase * Math.PI));
            DrawSymbol(dc, sym, x, y, s, alpha, i);
        }
    }

    /// <summary>Quick 3-symbol burst (used on landing / gift moments).</summary>
    public static void RenderBurst(DrawingContext dc, string pack, double t, double cx, double cy, double scale = 1.0)
    {
        var sym = ForPack(pack);
        for (var i = 0; i < 3; i++)
        {
            var phase = Math.Clamp(t / 0.9, 0, 1);
            var x = cx + (i - 1) * 22 + Math.Sin(i * 2.1) * 8 * phase;
            var y = cy - 18 * phase - Math.Abs(i - 1) * 6;
            var alpha = 1 - phase;
            DrawSymbol(dc, sym, x, y, scale, alpha, i);
        }
    }

    /// <summary>Golden "+N" coin popup for economy rewards.</summary>
    public static void RenderCoinPopup(DrawingContext dc, int amount, double t, double cx, double cy)
    {
        var phase = Math.Clamp(t / 1.2, 0, 1);
        if (phase >= 1) return;
        var y = cy - phase * 40;
        var alpha = phase < 0.1 ? phase / 0.1 : 1 - Math.Max(0, (phase - 0.6) / 0.4);
        var brush = CatPalette.Frozen("#CCFFD54F");
        dc.PushOpacity(alpha);
        DrawCoin(dc, cx - 14, y, 7);
        DrawText(dc, $"+{amount}", cx + 2, y - 8, 15, CatPalette.Frozen("#FF8A6D1A"));
        dc.Pop();
    }

    /// <summary>
    /// Reminder / notification speech bubble above the cat: soft white card, wrapped
    /// message, a small tail pointing at the head and a gentle pop-in/out animation.
    /// </summary>
    public static void RenderSpeechBubble(DrawingContext dc, string title, string message,
        double elapsed, double canvasW, double headY, double scale)
    {
        // pop in over 250 ms, hold, then pop out over the last 500 ms
        var life = 7.0;
        var appear = Math.Clamp(elapsed / 0.25, 0, 1);
        var disappear = elapsed > life - 0.5 ? Math.Clamp((life - elapsed) / 0.5, 0, 1) : 1;
        var pop = EaseOutBack(appear) * disappear;
        if (pop <= 0.01) return;

        var maxW = Math.Min(320 * scale, canvasW * 1.6);
        var body = string.IsNullOrWhiteSpace(message) ? title : message;

        var typeface = new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal,
            FontWeights.Medium, FontStretches.Normal);
        var bodyW = 0.0;
        double WrapHeight(string s, double size, out double w)
        {
            var ft = new FormattedText(s, CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
                typeface, size, CatPalette.Frozen("#FF2E3440"), 1.0) { MaxTextWidth = maxW - 28 };
            w = Math.Min(ft.WidthIncludingTrailingWhitespace + 28, maxW);
            return ft.Height;
        }
        var titleH = WrapHeight(title, 14.5 * scale, out var titleW);
        var bodyH = string.IsNullOrWhiteSpace(message) ? 0 : WrapHeight(message, 12.5 * scale, out bodyW);
        var w = Math.Max(titleW, bodyW) + 24 * scale;
        var h = titleH + bodyH + (bodyH > 0 ? 4 : 0) + 18 * scale;

        var cx = canvasW / 2;
        var bottom = headY + 10 * scale;
        var x = cx - w / 2;
        var y = bottom - h - 16 * scale - 6 * scale;

        dc.PushOpacity(Math.Clamp(pop, 0, 1));
        try
        {
            var ys = y + (1 - EaseOutBack(appear)) * 14;      // little rise-in

            // tail
            var tail = new StreamGeometry();
            using (var ctx = tail.Open())
            {
                ctx.BeginFigure(new Point(cx - 8 * scale, ys + h - 1), true, true);
                ctx.LineTo(new Point(cx, ys + h + 14 * scale), true, true);
                ctx.LineTo(new Point(cx + 9 * scale, ys + h - 1), true, true);
            }
            dc.DrawGeometry(CatPalette.Frozen("#F2FFFFFF"), new Pen(CatPalette.Frozen("#33000000"), 1), tail);

            var card = new Rect(x, ys, w, h);
            dc.DrawRoundedRectangle(CatPalette.Frozen("#F2FFFFFF"),
                new Pen(CatPalette.Frozen("#33000000"), 1), card, 14 * scale, 14 * scale);

            var ty = ys + 9 * scale;
            DrawWrapped(dc, title, typeface, 14.5 * scale, FontWeights.Bold,
                CatPalette.Frozen("#FF2E3440"), new Rect(x + 12 * scale, ty, w - 24 * scale, titleH + 4));
            ty += titleH + 4;
            if (bodyH > 0)
                DrawWrapped(dc, message, typeface, 12.5 * scale, FontWeights.Normal,
                    CatPalette.Frozen("#FF5A6072"), new Rect(x + 12 * scale, ty, w - 24 * scale, bodyH + 4));

            // clock icon dot
            dc.DrawEllipse(CatPalette.Frozen("#FFE8B23A"), null,
                new Point(x + w - 14 * scale, ys + 14 * scale), 5 * scale, 5 * scale);
        }
        finally
        {
            dc.Pop();
        }
    }

    private static double EaseOutBack(double t)
    {
        const double c1 = 1.70158, c3 = c1 + 1;
        var x = Math.Clamp(t, 0, 1);
        return 1 + c3 * Math.Pow(x - 1, 3) + c1 * Math.Pow(x - 1, 2);
    }

    private static void DrawWrapped(DrawingContext dc, string text, Typeface face,
        double size, FontWeight weight, Brush brush, Rect box)
    {
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
            new Typeface(face.FontFamily, face.Style, weight, face.Stretch),
            size, brush, 1.0)
        {
            MaxTextWidth = box.Width,
            MaxTextHeight = box.Height + 10,
            Trimming = TextTrimming.WordEllipsis,
        };
        dc.DrawText(ft, box.TopLeft);
    }

    // ------------------------------------------------------------ internals

    private static void DrawSymbol(DrawingContext dc, Symbol s, double x, double y, double scale, double alpha, int variant)
    {
        if (alpha <= 0.01) return;
        dc.PushTransform(new TranslateTransform(x, y));
        dc.PushTransform(new ScaleTransform(scale, scale));
        dc.PushOpacity(alpha);
        switch (s)
        {
            case Symbol.Heart: DrawHeart(dc, 0, 0, 9); break;
            case Symbol.Z: DrawText(dc, "Z", -6, -12, 18 + variant * 2, CatPalette.Frozen("#FF7FA8D8")); break;
            case Symbol.Note: DrawNote(dc, variant); break;
            case Symbol.Bang: DrawText(dc, "!", -4, -14, 20, CatPalette.Frozen("#FFE8B23A")); break;
            case Symbol.Star: DrawStar(dc, 0, 0, 8); break;
        }
        dc.Pop();
        dc.Pop();
        dc.Pop();
    }

    private static void DrawHeart(DrawingContext dc, double x, double y, double r)
    {
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            ctx.BeginFigure(new Point(x, y + r * 0.9), true, true);
            ctx.BezierTo(new Point(x - r * 1.4, y + r * 0.1), new Point(x - r * 0.7, y - r * 1.1), new Point(x, y - r * 0.35), true, false);
            ctx.BezierTo(new Point(x + r * 0.7, y - r * 1.1), new Point(x + r * 1.4, y + r * 0.1), new Point(x, y + r * 0.9), true, false);
        }
        g.Freeze();
        dc.DrawGeometry(CatPalette.Frozen("#E8F06262"), null, g);
    }

    private static void DrawNote(DrawingContext dc, int variant)
    {
        var stem = CatPalette.Frozen("#FF6B5B95");
        var head = CatPalette.Frozen("#FF8A79B5");
        dc.DrawEllipse(head, null, new Point(0, 0), 4.2, 3.4);
        var up = variant % 2 == 0 ? -16 : -20;
        var pen = new Pen(stem, 2.2);
        dc.DrawLine(pen, new Point(3.6, 0), new Point(3.6, up));
        if (variant % 2 == 0)
            dc.DrawLine(pen, new Point(3.6, up), new Point(10, up + 4));
        else
            dc.DrawEllipse(head, null, new Point(10, up + 4), 3.2, 2.6);
    }

    private static void DrawStar(DrawingContext dc, double x, double y, double r)
    {
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            Point P(int i)
            {
                var ang = -Math.PI / 2 + i * Math.PI / 5;
                var rad = i % 2 == 0 ? r : r * 0.45;
                return new Point(x + Math.Cos(ang) * rad, y + Math.Sin(ang) * rad);
            }
            ctx.BeginFigure(P(0), true, true);
            for (var i = 1; i < 10; i++) ctx.LineTo(P(i), true, false);
        }
        g.Freeze();
        dc.DrawGeometry(CatPalette.Frozen("#E8F7D64A"), null, g);
    }

    private static void DrawCoin(DrawingContext dc, double x, double y, double r)
    {
        dc.DrawEllipse(CatPalette.Frozen("#FFF2C94C"), new Pen(CatPalette.Frozen("#FFB98A1F"), 1.4), new Point(x, y), r, r);
        DrawText(dc, "$", x - 3.4, y - 6.4, 10, CatPalette.Frozen("#FF8A6D1A"));
    }

    private static void DrawText(DrawingContext dc, string text, double x, double y, double size, Brush brush)
    {
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal),
            size, brush, 1.0);
        dc.DrawText(ft, new Point(x, y));
    }
}
