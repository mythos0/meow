// WpfReplay.cs — replays a Core display list onto a WPF DrawingContext.
// Brushes/pens are cached and FROZEN (RAM diet: no per-frame Freezable churn,
// immutable shared instances). Transform/clip pushes mirror the Core builder's
// save/restore brackets exactly.

namespace MeowCat.Rendering;

using System.Globalization;
using System.Windows;
using System.Windows.Media;
using MeowCat.Core.Render;

public sealed class WpfReplay
{
    private readonly Dictionary<string, Brush> _brushes = new();
    private readonly Dictionary<string, Pen> _pens = new();
    private readonly Typeface _typefaceBold = new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Bold, FontStretches.Normal);
    private readonly Typeface _typefaceRegular = new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Regular, FontStretches.Normal);

    public void Replay(IReadOnlyList<DrawOp> ops, DrawingContext dc)
    {
        var pushes = new Stack<int>();   // pushes outstanding per Save level
        int current = 0;                 // total outstanding pushes

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
                    while (current > target) { dc.Pop(); current--; }
                    break;
                }

                case OpTransform t:
                    dc.PushTransform(new MatrixTransform(t.M11, t.M12, t.M21, t.M22, t.Dx, t.Dy));
                    current++;
                    break;

                case OpClipEllipse c:
                {
                    var geo = new EllipseGeometry(new Point(c.Cx, c.Cy), Math.Max(0.01, c.Rx), Math.Max(0.01, c.Ry));
                    if (Math.Abs(c.Rot) > 1e-9) geo.Transform = new RotateTransform(c.Rot * 180.0 / Math.PI);
                    geo.Freeze();
                    dc.PushClip(geo);
                    current++;
                    break;
                }

                case OpFillEllipse e:
                    dc.DrawEllipse(BrushFor(e.P), null, new Point(e.Cx, e.Cy), Math.Max(0, e.Rx), Math.Max(0, e.Ry));
                    break;

                case OpFillRect r:
                    dc.DrawRectangle(BrushFor(r.P), null, new Rect(r.X, r.Y, r.W, r.H));
                    break;

                case OpFillPath f:
                    dc.DrawGeometry(BrushFor(f.P), null, GeometryFor(f.Path));
                    break;

                case OpStrokePath s:
                    dc.DrawGeometry(null, PenFor(s.P, s.Width), GeometryFor(s.Path));
                    break;

                case OpGlyph g:
                    DrawGlyph(dc, g);
                    break;

                case OpAlpha:
                    break; // alpha is baked into paints by the Core builder
            }
        }
        // unwind anything left (defensive — the builder is balanced)
        while (current > 0) { dc.Pop(); current--; }
    }

    // ---------------------------------------------------------------- brushes
    private static string Key(Paint p)
    {
        if (p.Solid != null) return $"S:{p.Solid}:{(int)Math.Round(p.Alpha * 255)}";
        if (p.Radial != null)
        {
            var r = p.Radial;
            return $"R:{r.Cx},{r.Cy},{r.R0},{r.R1}:{StopsKey(r.Stops)}:{(int)Math.Round(p.Alpha * 255)}";
        }
        if (p.Linear != null)
        {
            var l = p.Linear;
            return $"L:{l.X0},{l.Y0},{l.X1},{l.Y1}:{StopsKey(l.Stops)}:{(int)Math.Round(p.Alpha * 255)}";
        }
        return "S:#808080:255";
    }

    private static string StopsKey((double Offset, string Color)[] stops)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var (o, c) in stops) sb.Append(o.ToString("0.###", CultureInfo.InvariantCulture)).Append(':').Append(c).Append(';');
        return sb.ToString();
    }

    private Brush BrushFor(Paint p)
    {
        string key = Key(p);
        if (_brushes.TryGetValue(key, out var b)) return b;

        Brush brush;
        if (p.Radial != null)
        {
            var r = p.Radial;
            // fold the inner radius into the stops (see ColorUtil.RemapRadialStops)
            var grad = new RadialGradientBrush(Stops(ColorUtil.RemapRadialStops(r.R0, r.R1, r.Stops)))
            {
                Center = new Point(r.Cx, r.Cy),
                GradientOrigin = new Point(r.Cx, r.Cy),
                RadiusX = Math.Max(0.01, r.R1),
                RadiusY = Math.Max(0.01, r.R1),
            };
            brush = grad;
        }
        else if (p.Linear != null)
        {
            var l = p.Linear;
            brush = new LinearGradientBrush(Stops(l.Stops), new Point(l.X0, l.Y0), new Point(l.X1, l.Y1));
        }
        else
        {
            var (rr, gg, bb, aa) = ColorUtil.Parse(p.Solid ?? "#808080");
            byte a = (byte)Math.Clamp(Math.Round(aa * p.Alpha * 255), 0, 255);
            brush = new SolidColorBrush(Color.FromArgb(a, rr, gg, bb));
        }
        brush.Freeze();
        if (_brushes.Count < 4096) _brushes[key] = brush;   // bounded cache
        return brush;
    }

    private Pen PenFor(Paint p, double width)
    {
        string key = Key(p) + ":w" + width.ToString("0.##", CultureInfo.InvariantCulture);
        if (_pens.TryGetValue(key, out var pen)) return pen;
        pen = new Pen(BrushFor(p), width)
        {
            StartLineCap = PenLineCap.Round,
            EndLineCap = PenLineCap.Round,
            LineJoin = PenLineJoin.Round,
        };
        pen.Freeze();
        if (_pens.Count < 4096) _pens[key] = pen;
        return pen;
    }

    private static GradientStopCollection Stops((double Offset, string Color)[] stops)
    {
        var col = new GradientStopCollection(stops.Length);
        foreach (var (offset, color) in stops)
        {
            var (r, g, b, a) = ColorUtil.Parse(color);
            col.Add(new GradientStop(Color.FromArgb((byte)Math.Round(a * 255), r, g, b), offset));
        }
        return col;
    }

    // ---------------------------------------------------------------- geometry
    private static PathGeometry GeometryFor(Geom geom)
    {
        var figures = new List<PathFigure>(4);
        PathFigure? fig = null;
        foreach (var (kind, x1, y1, x2, y2, x3, y3) in geom.Segs)
        {
            switch (kind)
            {
                case Geom.SegKind.Move:
                    if (fig != null) figures.Add(fig);
                    fig = new PathFigure { StartPoint = new Point(x1, y1), IsFilled = true, IsClosed = false };
                    break;
                case Geom.SegKind.Line:
                    fig?.Segments.Add(new LineSegment(new Point(x1, y1), true));
                    break;
                case Geom.SegKind.Quad:
                    fig?.Segments.Add(new QuadraticBezierSegment(new Point(x1, y1), new Point(x2, y2), true));
                    break;
                case Geom.SegKind.Cubic:
                    fig?.Segments.Add(new BezierSegment(new Point(x1, y1), new Point(x2, y2), new Point(x3, y3), true));
                    break;
                case Geom.SegKind.Close:
                    if (fig != null) fig.IsClosed = true;
                    break;
            }
        }
        if (fig != null) figures.Add(fig);

        var pg = new PathGeometry(figures) { FillRule = FillRule.Nonzero };
        pg.Freeze();
        return pg;
    }

    // ---------------------------------------------------------------- glyphs
    private void DrawGlyph(DrawingContext dc, OpGlyph g)
    {
        const double dip = 1.0;
        var face = g.Bold ? _typefaceBold : _typefaceRegular;

        if (g.Stroke != null)
        {
            var (sr, sg, sb, sa) = ColorUtil.Parse(g.Stroke.Solid ?? "#ffffff");
            byte salpha = (byte)Math.Clamp(Math.Round(sa * g.Stroke.Alpha * 255), 0, 255);
            var sbrush = new SolidColorBrush(Color.FromArgb(salpha, sr, sg, sb));
            sbrush.Freeze();
            double w = Math.Max(1.2, g.StrokeW);
            foreach (var (ox, oy) in new[]
                     {
                         (-w, 0), (w, 0), (0, -w), (0, w),
                         (-w * 0.7, -w * 0.7), (w * 0.7, w * 0.7), (-w * 0.7, w * 0.7), (w * 0.7, -w * 0.7),
                     })
            {
                var ghost = new FormattedText(g.Text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
                    face, g.SizePx, sbrush, dip);
                dc.DrawText(ghost, new Point(g.X - ghost.Width / 2, g.Y - ghost.Height / 2 + oy));
            }
        }

        var (r, gr, b, a) = ColorUtil.Parse(g.Fill.Solid ?? "#000000");
        byte alpha = (byte)Math.Clamp(Math.Round(a * g.Fill.Alpha * 255), 0, 255);
        var fg = new SolidColorBrush(Color.FromArgb(alpha, r, gr, b));
        fg.Freeze();
        var ft = new FormattedText(g.Text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
            face, g.SizePx, fg, dip);
        dc.DrawText(ft, new Point(g.X - ft.Width / 2, g.Y - ft.Height / 2));
    }
}
