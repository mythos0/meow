// Canvas.cs — the display-list canvas the artwork draws onto. Implements the
// small subset of the HTML5 canvas 2D state machine the cat renderer needs
// (save/restore, transform, globalAlpha, clip, fills) while flattening every
// arc into polylines so all backends draw identical geometry.

namespace MeowCat.Core.Render;

using System.Numerics;

public sealed class Canvas
{
    public List<DrawOp> Ops { get; } = new();

    private readonly Stack<Matrix3x2> _mat = new();
    private Matrix3x2 _m = Matrix3x2.Identity;
    private readonly Stack<double> _alpha = new();
    private double _a = 1.0;

    public double Alpha => _a;

    // ------------------------------------------------------------ state
    public void Save()
    {
        Ops.Add(new OpSave());
        _mat.Push(_m); _alpha.Push(_a);
    }

    public void Restore()
    {
        Ops.Add(new OpRestore());
        if (_mat.Count > 0) _m = _mat.Pop(); else _m = Matrix3x2.Identity;
        if (_alpha.Count > 0) _a = _alpha.Pop(); else _a = 1.0;
    }

    public void Translate(double dx, double dy) => Apply(Matrix3x2.CreateTranslation((float)dx, (float)dy));
    public void Rotate(double radians) => Apply(Matrix3x2.CreateRotation((float)radians));
    public void Scale(double sx, double sy) => Apply(Matrix3x2.CreateScale((float)sx, (float)sy));

    private void Apply(Matrix3x2 d)
    {
        // canvas compose: new = d * current  (row-vector, applied before existing)
        _m = Matrix3x2.Multiply(d, _m);
        Ops.Add(new OpTransform(d.M11, d.M12, d.M21, d.M22, d.M31, d.M32));
    }

    public void SetAlpha(double a)
    {
        _a = a;
        Ops.Add(new OpAlpha(a));
    }

    public void ClipEllipse(double cx, double cy, double rx, double ry, double rot = 0)
        => Ops.Add(new OpClipEllipse(cx, cy, rx, ry, rot));

    // ------------------------------------------------------------ helpers
    /// <summary>Lighten/darken a #rrggbb color. amt -1..1 (matches canvas port helper).</summary>
    public static string Shade(string hex, double amt)
    {
        if (string.IsNullOrEmpty(hex) || hex[0] != '#') return hex ?? "#808080";
        long n;
        try { n = Convert.ToInt64(hex.Substring(1), 16); } catch { return hex; }
        if (hex.Length == 8) n >>= 8;                     // tolerate #aarrggbb
        double r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
        else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
        return $"#{(int)r:X2}{(int)g:X2}{(int)b:X2}";
    }

    public Paint Solid(string hex, double alpha = 1.0) => new() { Solid = hex, Alpha = alpha * _a };

    public Paint Radial(double cx, double cy, double r0, double r1, (double, string)[] stops, double alpha = 1.0)
        => new() { Radial = new RadialGrad { Cx = cx, Cy = cy, R0 = r0, R1 = r1, Stops = stops }, Alpha = alpha * _a };

    public Paint Linear(double x0, double y0, double x1, double y1, (double, string)[] stops, double alpha = 1.0)
        => new() { Linear = new LinearGrad { X0 = x0, Y0 = y0, X1 = x1, Y1 = y1, Stops = stops }, Alpha = alpha * _a };

    public void FillEllipse(double cx, double cy, double rx, double ry, double rot, Paint p)
        => Ops.Add(new OpFillEllipse(cx, cy, rx, ry, rot, p));

    public void FillRect(double x, double y, double w, double h, Paint p)
        => Ops.Add(new OpFillRect(x, y, w, h, p));

    public void FillPath(Geom g, Paint p) => Ops.Add(new OpFillPath(g, p));
    public void StrokePath(Geom g, double width, Paint p) => Ops.Add(new OpStrokePath(g, width, p));

    // ------------------------------------------------------------ shape builders

    /// <summary>
    /// Tapered capsule between two points — exact port of the canvas "limb"
    /// primitive: back cap of circle 1 (a+π/2 → a+3π/2), line to circle 2,
    /// forward cap of circle 2 (a+3π/2 → a+5π/2), close.
    /// </summary>
    public static Geom CapsuleGeom(double x1, double y1, double r1, double x2, double y2, double r2, int segs = 12)
    {
        var g = new Geom();
        double a = Math.Atan2(y2 - y1, x2 - x1);
        void Cap(double cx, double cy, double r, double from, double to, bool moveFirst)
        {
            for (int i = 0; i <= segs; i++)
            {
                double ang = from + (to - from) * i / (double)segs;
                double px = cx + Math.Cos(ang) * r, py = cy + Math.Sin(ang) * r;
                if (i == 0 && moveFirst) g.Move(px, py); else g.Line(px, py);
            }
        }
        Cap(x1, y1, r1, a + Math.PI / 2, a + Math.PI * 1.5, true);   // back cap of circle 1
        Cap(x2, y2, r2, a + Math.PI * 1.5, a + Math.PI * 2.5, false); // forward cap of circle 2
        g.Close();
        return g;
    }

    public void Capsule(double x1, double y1, double r1, double x2, double y2, double r2, Paint p)
        => FillPath(CapsuleGeom(x1, y1, r1, x2, y2, r2), p);

    /// <summary>Partial ellipse arc flattened to a polyline (for strokes).</summary>
    public static Geom EllipseArcGeom(double cx, double cy, double rx, double ry, double a0, double a1, int segs = 20)
    {
        var g = new Geom();
        for (int i = 0; i <= segs; i++)
        {
            double t = i / (double)segs;
            double ang = a0 + (a1 - a0) * t;
            double px = cx + Math.Cos(ang) * rx, py = cy + Math.Sin(ang) * ry;
            if (i == 0) g.Move(px, py); else g.Line(px, py);
        }
        return g;
    }

    public void StrokeEllipseArc(double cx, double cy, double rx, double ry, double a0, double a1, double w, Paint p)
        => StrokePath(EllipseArcGeom(cx, cy, rx, ry, a0, a1), w, p);

    /// <summary>Full ellipse outline stroked (rim light) — flattened.</summary>
    public static Geom EllipseGeom(double cx, double cy, double rx, double ry, int segs = 36)
        => EllipseArcGeom(cx, cy, rx, ry, 0, Math.PI * 2, segs);

    public void FillCircle(double cx, double cy, double r, Paint p) => FillEllipse(cx, cy, r, r, 0, p);
}
