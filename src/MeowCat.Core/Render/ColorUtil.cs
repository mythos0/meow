// ColorUtil.cs — shared color parsing for display-list backends.
// Accepts "#rgb", "#rrggbb", "#aarrggbb", "rgb(r,g,b)", "rgba(r,g,b,a)".

namespace MeowCat.Core.Render;

using System.Globalization;

public static class ColorUtil
{
    public static (byte R, byte G, byte B, double A) Parse(string s)
    {
        s = (s ?? "#808080").Trim();
        try
        {
            if (s.StartsWith("rgba", StringComparison.OrdinalIgnoreCase))
            {
                var parts = s.Substring(5, s.Length - 6).Split(',');
                double a = parts.Length == 4
                    ? double.Parse(parts[3].Trim(), CultureInfo.InvariantCulture) : 1.0;
                return ((byte)int.Parse(parts[0].Trim(), CultureInfo.InvariantCulture),
                        (byte)int.Parse(parts[1].Trim(), CultureInfo.InvariantCulture),
                        (byte)int.Parse(parts[2].Trim(), CultureInfo.InvariantCulture),
                        Math.Clamp(a, 0, 1));
            }
            if (s.StartsWith("rgb", StringComparison.OrdinalIgnoreCase))
            {
                var parts = s.Substring(4, s.Length - 5).Split(',');
                return ((byte)int.Parse(parts[0].Trim(), CultureInfo.InvariantCulture),
                        (byte)int.Parse(parts[1].Trim(), CultureInfo.InvariantCulture),
                        (byte)int.Parse(parts[2].Trim(), CultureInfo.InvariantCulture), 1.0);
            }
            if (s.StartsWith('#'))
            {
                string hex = s.Substring(1);
                switch (hex.Length)
                {
                    case 3:
                        return ((byte)(Convert.ToInt32(new string(hex[0], 2), 16)),
                                (byte)(Convert.ToInt32(new string(hex[1], 2), 16)),
                                (byte)(Convert.ToInt32(new string(hex[2], 2), 16)), 1.0);
                    case 6:
                        return ((byte)(Convert.ToInt32(hex.Substring(0, 2), 16)),
                                (byte)(Convert.ToInt32(hex.Substring(2, 2), 16)),
                                (byte)(Convert.ToInt32(hex.Substring(4, 2), 16)), 1.0);
                    case 8:
                        return ((byte)(Convert.ToInt32(hex.Substring(2, 2), 16)),
                                (byte)(Convert.ToInt32(hex.Substring(4, 2), 16)),
                                (byte)(Convert.ToInt32(hex.Substring(6, 2), 16)),
                                Convert.ToInt32(hex.Substring(0, 2), 16) / 255.0);
                }
            }
        }
        catch { /* fall through */ }
        return (128, 128, 128, 1.0);
    }

    /// <summary>
    /// Canvas radial gradients map offsets over [r0, r1]; simple radial-gradient
    /// APIs (WPF RadialGradientBrush, SKShader.CreateRadialGradient) map over
    /// [0, r1]. This remaps the stops so the render is identical, and inserts a
    /// leading stop so the inner disc (dist &lt; r0) keeps the first colour.
    /// </summary>
    public static (double Offset, string Color)[] RemapRadialStops(
        double r0, double r1, (double Offset, string Color)[] stops)
    {
        if (stops == null || stops.Length == 0) return stops ?? Array.Empty<(double, string)>();
        if (r0 <= 0.01 || r1 <= r0) return stops;
        double t0 = r0 / r1;
        var list = new List<(double, string)>(stops.Length + 1) { (0.0, stops[0].Color) };
        foreach (var (o, c) in stops)
            list.Add((Math.Clamp(t0 + o * (1 - t0), 0, 1), c));
        return list.ToArray();
    }
}
