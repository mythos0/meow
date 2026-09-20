// DrawOps.cs — a tiny vector display list that decouples the procedural cat
// artwork from any concrete graphics API. The Core builder emits ops; backends
// replay them: WPF DrawingContext in production, SkiaSharp in offline tests.
// All arcs are pre-flattened to polylines here so both backends render the
// exact same geometry with no arc-semantics differences.

namespace MeowCat.Core.Render;

public sealed class Paint
{
    public string? Solid;                       // "#rrggbb" or "#aarrggbb"
    public double Alpha = 1.0;                  // extra paint alpha
    public RadialGrad? Radial;
    public LinearGrad? Linear;

    public static Paint SolidPaint(string hex, double alpha = 1.0)
        => new() { Solid = hex, Alpha = alpha };
}

public sealed class RadialGrad
{
    public double Cx, Cy, R0, R1;
    public (double Offset, string Color)[] Stops = System.Array.Empty<(double, string)>();
}

public sealed class LinearGrad
{
    public double X0, Y0, X1, Y1;
    public (double Offset, string Color)[] Stops = System.Array.Empty<(double, string)>();
}

/// <summary>Flattened path: figures of Move/Line/Quad/Cubic segments.</summary>
public sealed class Geom
{
    public enum SegKind : byte { Move, Line, Quad, Cubic, Close }

    public List<(SegKind Kind, double X1, double Y1, double X2, double Y2, double X3, double Y3)> Segs = new();

    public void Move(double x, double y) => Segs.Add((SegKind.Move, x, y, 0, 0, 0, 0));
    public void Line(double x, double y) => Segs.Add((SegKind.Line, x, y, 0, 0, 0, 0));
    public void Quad(double cx, double cy, double x, double y) => Segs.Add((SegKind.Quad, cx, cy, x, y, 0, 0));
    public void Cubic(double c1x, double c1y, double c2x, double c2y, double x, double y)
        => Segs.Add((SegKind.Cubic, c1x, c1y, c2x, c2y, x, y));
    public void Close() => Segs.Add((SegKind.Close, 0, 0, 0, 0, 0, 0));
}

public abstract record DrawOp;

// transform / state stack (mirrors canvas save/restore semantics)
public sealed record OpSave() : DrawOp;
public sealed record OpRestore() : DrawOp;
// append transform given in row-vector form:  x' = x*M11 + y*M21 + Dx ; y' = x*M12 + y*M22 + Dy
public sealed record OpTransform(double M11, double M12, double M21, double M22, double Dx, double Dy) : DrawOp;
public sealed record OpAlpha(double Alpha) : DrawOp;                     // sets absolute global alpha
public sealed record OpClipEllipse(double Cx, double Cy, double Rx, double Ry, double Rot) : DrawOp;

public sealed record OpFillEllipse(double Cx, double Cy, double Rx, double Ry, double Rot, Paint P) : DrawOp;
public sealed record OpFillRect(double X, double Y, double W, double H, Paint P) : DrawOp;
public sealed record OpFillPath(Geom Path, Paint P) : DrawOp;
public sealed record OpStrokePath(Geom Path, double Width, Paint P) : DrawOp;
// glyphs for emotes ('?', '!', 'Z', 'z'); baseline-middle centered at (X,Y)
public sealed record OpGlyph(string Text, double X, double Y, double SizePx, bool Bold, Paint Fill, Paint? Stroke, double StrokeW) : DrawOp;
