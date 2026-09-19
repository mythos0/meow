using System;
using System.Runtime.InteropServices;

namespace MeowCat.Platform;

/// <summary>
/// Fixes the "cat disappears behind a fullscreen window" bug: WPF's Topmost only
/// asserts HWND_TOPMOST once, and fullscreen apps (browsers F11, games, slideshows,
/// video players) create their own topmost windows afterwards — pushing the cat below.
/// This helper re-asserts topmost for a set of windows on a timer, without stealing
/// focus (SWP_NOACTIVATE) and without moving them (SWP_NOMOVE | SWP_NOSIZE).
/// </summary>
public static class TopmostEnforcer
{
    private const int SWP_NOSIZE = 0x0001;
    private const int SWP_NOMOVE = 0x0002;
    private const int SWP_NOACTIVATE = 0x0010;
    private static readonly IntPtr HwndTopmost = new(-1);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y,
        int cx, int cy, int flags);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int index);

    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOPMOST = 0x00000008L;

    /// <summary>True when the window still carries the topmost ex-style bit.</summary>
    public static bool IsTopmostStyle(IntPtr hwnd)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return false;
        try { return (GetWindowLong(hwnd, GWL_EXSTYLE) & (int)WS_EX_TOPMOST) != 0; }
        catch (Exception) { return false; }
    }

    /// <summary>Re-asserts topmost for one hwnd. Returns false when the call failed.</summary>
    public static bool MakeTopmost(IntPtr hwnd)
    {
        if (!OperatingSystem.IsWindows() || hwnd == IntPtr.Zero) return false;
        try
        {
            return SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        catch (Exception)
        {
            return false;
        }
    }
}
