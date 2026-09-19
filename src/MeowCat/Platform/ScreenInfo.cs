using System;
using System.Drawing;

namespace MeowCat.Platform;

/// <summary>
/// Screen geometry helpers: converts physical pixels (from Win32) into WPF DIU and exposes
/// the primary work area where the cat walks. Non-Windows fallback keeps tests happy.
/// </summary>
public static class ScreenInfo
{
    private static double? _scale;
    private static readonly (double X, double Y, double W, double H, double ScreenH) _geo = InitGeo();

    /// <summary>Primary display scale (96 dpi = 1.0).</summary>
    public static double Scale
    {
        get
        {
            if (_scale.HasValue) return _scale.Value;
            if (!OperatingSystem.IsWindows()) { _scale = 1.0; return 1.0; }
            try
            {
                using var g = Graphics.FromHwnd(IntPtr.Zero);
                _scale = g.DpiX / 96.0;
            }
            catch (Exception) { _scale = 1.0; }
            return _scale.Value;
        }
    }

    /// <summary>Primary screen size in DIU.</summary>
    public static (double W, double H) ScreenBounds => (_geo.W, _geo.ScreenH);

    /// <summary>Primary work area (excludes taskbar) in DIU — the cat's walking floor.</summary>
    public static (double X, double Y, double W, double H) WorkArea => (_geo.X, _geo.Y, _geo.W, _geo.H);

    public static double PxToDiu(double px) => px / Scale;
    public static double DiuToPx(double diu) => diu * Scale;

    public static (double X, double Y, double W, double H) RectPxToDiu(int x, int y, int w, int h) =>
        (PxToDiu(x), PxToDiu(y), PxToDiu(w), PxToDiu(h));

    private static (double X, double Y, double W, double H, double ScreenH) InitGeo()
    {
        if (OperatingSystem.IsWindows())
        {
            try
            {
                var wa = System.Windows.SystemParameters.WorkArea; // already DIU
                var h = System.Windows.SystemParameters.PrimaryScreenHeight;
                return (wa.X, wa.Y, wa.Width, wa.Height, h);
            }
            catch (Exception) { /* fall through */ }
        }
        return (0, 0, 1920, 1040, 1080);
    }
}
