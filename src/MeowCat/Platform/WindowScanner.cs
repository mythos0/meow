// WindowScanner.cs — native EnumWindows platform scanner. The Electron version
// spawned PowerShell every 3.2s (CPU churn + RAM spikes + extra processes);
// the C# host calls user32/dwmapi directly on a timer — zero child processes.

namespace MeowCat.Platform;

using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Threading;

public sealed record WinRect(string Title, int X, int Y, int W, int H);

public static class NativeWinEnum
{
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int L, T, R, B; }

    private const int DWMWA_CLOAKED = 14;

    /// <summary>One synchronous scan. Returns visible, uncloaked, non-minimized windows.</summary>
    public static List<WinRect> Scan()
    {
        var list = new List<WinRect>();
        if (!OperatingSystem.IsWindows()) return list;
        try
        {
            EnumWindows((h, _) =>
            {
                if (!IsWindowVisible(h)) return true;
                if (IsIconic(h)) return true;
                if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out int cloaked, 4) == 0 && cloaked != 0) return true;

                var sb = new StringBuilder(512);
                GetWindowText(h, sb, 512);
                string title = sb.ToString();
                if (title.Length < 1) return true;

                if (GetWindowRect(h, out RECT r))
                {
                    int w = r.R - r.L, hh = r.B - r.T;
                    if (w >= 120 && hh >= 80) list.Add(new WinRect(title, r.L, r.T, w, hh));
                }
                return true;
            }, IntPtr.Zero);
        }
        catch { /* never crash the cat over a scan */ }
        return list;
    }
}

/// <summary>Timer-driven scanner feeding the brain's platform list (screen DIU rects).</summary>
public sealed class WindowScanner : IDisposable
{
    private readonly DispatcherTimer _timer;
    private readonly Action<List<(double X, double Y, double W, double H)>> _onResult;
    private string _lastSig = "";

    public WindowScanner(Action<List<(double X, double Y, double W, double H)>> onResult, double intervalSec = 3.2)
    {
        _onResult = onResult;
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(intervalSec) };
        _timer.Tick += (_, _) => Tick();
    }

    public void Start() { Tick(); _timer.Start(); }
    public void Stop() => _timer.Stop();

    private void Tick()
    {
        try
        {
            var raw = NativeWinEnum.Scan();
            double scale = ScreenInfo.Scale;
            var (wx, wy, _, _) = ScreenInfo.WorkArea;

            // physical px → workarea-local DIU + pure filters (min sizes, excluded titles)
            var converted = raw.Select(w =>
            {
                double x = w.X / scale - wx, y = w.Y / scale - wy;
                return new MeowCat.Core.Scan.RawWindow(w.Title, x, y, w.W / scale, w.H / scale);
            }).ToList();

            var plats = MeowCat.Core.Scan.ScanPure.ToPlatforms(converted)
                .Select(w => (w.X, w.Y, w.W, w.H))
                .ToList();

            string sig = string.Join("|", plats.Select(p => $"{p.X:0},{p.Y:0},{p.W:0},{p.H:0}"));
            if (sig == _lastSig) return;   // only push on change (RAM/CPU diet)
            _lastSig = sig;
            _onResult(plats);
        }
        catch { /* never crash over a scan */ }
    }

    public void Dispose() => Stop();
}
