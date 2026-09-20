// SkiaReplay.cs — replays a Core display list onto an SKCanvas.
// Used ONLY by the offline RenderProof tool so the exact same Core artwork can
// be rendered to PNG on Linux (production WPF uses WpfReplay; identical ops).

namespace RenderProof;

using SkiaSharp;
using MeowCat.Core.Render;

public static class SkiaReplay
{
    public static void Replay(IReadOnlyList<DrawOp> ops, SKCanvas cv, double alphaScale = 1.0)
    {
        var pushes = new Stack<int>();
        int current = 0;

        foreach (var op in ops)
        {
            switch (op)
            {
                case OpSave:
                    pushes.Push(current);
                    break;

                case OpRestore:
                {
                    int target = pushes.Count > 0 ? pushes.Pop() : 0;
                    while (current > target) { cv.Restore(); current--; }
                    break;
                }

                case OpTransform t:
                {
                    // WPF row-vector matrix → SKMatrix
                    var m = new SKMatrix
                    {
                        ScaleX = (float)t.M11,
                        SkewY = (float)t.M12,
                        SkewX = (float)t.M21,
                        ScaleY = (float)t.M22,
                        TransX = (float)t.Dx,
                        TransY = (float)t.Dy,
                        Persp0 = 0,          // affine: perspective row MUST be [0,0,1]
                        Persp1 = 0,
                        Persp2 = 1,
                    };
                    cv.Save();
                    cv.Concat(ref m);
                    current++;
                    break;
                }

                case OpClipEllipse c:
                {
                    cv.Save();
                    using var clip = new SKPath();
                    clip.AddOval(new SKRect(
                        (float)(c.Cx - c.Rx), (float)(c.Cy - c.Ry),
                        (float)(c.Cx + c.Rx), (float)(c.Cy + c.Ry)));
                    if (Math.Abs(c.Rot) > 1e-9)
                    {
                        cv.Translate((float)c.Cx, (float)c.Cy);
                        cv.RotateRadians((float)c.Rot);
                        cv.Translate((float)-c.Cx, (float)-c.Cy);
                    }
                    cv.ClipPath(clip, SKClipOperation.Intersect, true);
                    current++;
                    break;
                }

                case OpFillEllipse e:
                {
                    cv.Save();
                    cv.Translate((float)e.Cx, (float)e.Cy);
                    if (Math.Abs(e.Rot) > 1e-9) cv.RotateRadians((float)e.Rot);
                    using var p = PaintFor(e.P, alphaScale);
                    cv.DrawOval(0, 0, (float)Math.Max(0, e.Rx), (float)Math.Max(0, e.Ry), p);
                    cv.Restore();
                    break;
                }

                case OpFillRect r:
                    using (var p = PaintFor(r.P, alphaScale))
                        cv.DrawRect((float)r.X, (float)r.Y, (float)r.W, (float)r.H, p);
                    break;

                case OpFillPath f:
                    using (var path = PathFor(f.Path))
                    using (var p = PaintFor(f.P, alphaScale))
                        cv.DrawPath(path, p);
                    break;

                case OpStrokePath s:
                    using (var path = PathFor(s.Path))
                    using (var p = PaintFor(s.P, alphaScale))
                    {
                        p.Style = SKPaintStyle.Stroke;
                        p.StrokeWidth = (float)s.Width;
                        p.StrokeCap = SKStrokeCap.Round;
                        p.StrokeJoin = SKStrokeJoin.Round;
                        cv.DrawPath(path, p);
                    }
                    break;

                case OpGlyph g:
                    DrawGlyph(cv, g, alphaScale);
                    break;

                case OpAlpha:
                    break; // baked into paints by the Core builder
            }
        }
        while (current > 0) { cv.Restore(); current--; }
    }

    // ---------------------------------------------------------------- paint
    private static SKPaint PaintFor(Paint p, double alphaScale)
    {
        var paint = new SKPaint { IsAntialias = true, Style = SKPaintStyle.Fill };

        if (p.Radial != null)
        {
            var r = p.Radial;
            var stops = ColorUtil.RemapRadialStops(r.R0, r.R1, r.Stops);
            var colors = new SKColor[stops.Length];
            var points = new float[stops.Length];
            for (int i = 0; i < stops.Length; i++)
            {
                var (rr, gg, bb, aa) = ColorUtil.Parse(stops[i].Color);
                colors[i] = new SKColor(rr, gg, bb, (byte)Math.Clamp(Math.Round(aa * 255), 0, 255));
                points[i] = (float)stops[i].Offset;
            }
            // NOTE: never use CreateTwoPointConicalGradient with concentric circles —
            // it is degenerate in Skia and paints garbage over huge areas.
            paint.Shader = SKShader.CreateRadialGradient(
                new SKPoint((float)r.Cx, (float)r.Cy), (float)Math.Max(0.01, r.R1),
                colors, points, SKShaderTileMode.Clamp);
            paint.Color = SKColors.White.WithAlpha((byte)Math.Clamp(Math.Round(p.Alpha * alphaScale * 255), 0, 255));
        }
        else if (p.Linear != null)
        {
            var l = p.Linear;
            var colors = new SKColor[l.Stops.Length];
            var points = new float[l.Stops.Length];
            for (int i = 0; i < l.Stops.Length; i++)
            {
                var (rr, gg, bb, aa) = ColorUtil.Parse(l.Stops[i].Color);
                colors[i] = new SKColor(rr, gg, bb, (byte)Math.Clamp(Math.Round(aa * 255), 0, 255));
                points[i] = (float)l.Stops[i].Offset;
            }
            paint.Shader = SKShader.CreateLinearGradient(
                new SKPoint((float)l.X0, (float)l.Y0), new SKPoint((float)l.X1, (float)l.Y1),
                colors, points, SKShaderTileMode.Clamp);
            paint.Color = SKColors.White.WithAlpha((byte)Math.Clamp(Math.Round(p.Alpha * alphaScale * 255), 0, 255));
        }
        else
        {
            var (rr, gg, bb, aa) = ColorUtil.Parse(p.Solid ?? "#808080");
            paint.Color = new SKColor(rr, gg, bb,
                (byte)Math.Clamp(Math.Round(aa * p.Alpha * alphaScale * 255), 0, 255));
        }
        return paint;
    }

    private static SKPath PathFor(Geom g)
    {
        var path = new SKPath { FillType = SKPathFillType.Winding };
        foreach (var (kind, x1, y1, x2, y2, x3, y3) in g.Segs)
        {
            switch (kind)
            {
                case Geom.SegKind.Move: path.MoveTo((float)x1, (float)y1); break;
                case Geom.SegKind.Line: path.LineTo((float)x1, (float)y1); break;
                case Geom.SegKind.Quad: path.QuadTo((float)x1, (float)y1, (float)x2, (float)y2); break;
                case Geom.SegKind.Cubic: path.CubicTo((float)x1, (float)y1, (float)x2, (float)y2, (float)x3, (float)y3); break;
                case Geom.SegKind.Close: path.Close(); break;
            }
        }
        return path;
    }

    private static void DrawGlyph(SKCanvas cv, OpGlyph g, double alphaScale)
    {
        using var paint = new SKPaint
        {
            IsAntialias = true,
            TextAlign = SKTextAlign.Center,
            TextSize = (float)g.SizePx,
            Typeface = SKTypeface.FromFamilyName("DejaVu Sans",
                g.Bold ? SKFontStyle.Bold : SKFontStyle.Normal),
        };
        var (rr, gg, bb, aa) = ColorUtil.Parse(g.Fill.Solid ?? "#000000");
        paint.Color = new SKColor(rr, gg, bb, (byte)Math.Clamp(Math.Round(aa * g.Fill.Alpha * alphaScale * 255), 0, 255));
        // canvas textBaseline=middle ≈ baseline at y + 0.35*size
        float baseline = (float)(g.Y + g.SizePx * 0.35);
        cv.DrawText(g.Text, (float)g.X, baseline, paint);
    }
}
