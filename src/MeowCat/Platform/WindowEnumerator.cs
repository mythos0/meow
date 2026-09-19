using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

namespace MeowCat.Platform;

/// <summary>A top-level window found on the desktop, in device pixels.</summary>
public sealed record NativeWindow(IntPtr Handle, string Title, int X, int Y, int Width, int Height);

/// <summary>
/// Enumerates visible, non-minimized, titled top-level windows via user32 — the jump targets.
/// Excludes the taskbar, Start, and any window belonging to our own process.
/// Gracefully returns an empty list on non-Windows platforms (unit tests / design time).
/// </summary>
public static class WindowEnumerator
{
    public static bool IsWindows =>
        OperatingSystem.IsWindows();

    public static List<NativeWindow> GetJumpTargets(int minWidth = 220, int minHeight = 140)
    {
        var result = new List<NativeWindow>();
        if (!IsWindows) return result;

        var selfPid = Environment.ProcessId;
        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            if (IsIconic(hWnd)) return true;
            if (IsCloaked(hWnd)) return true;
            GetWindowThreadProcessId(hWnd, out var pid);
            if (pid == selfPid) return true;

            var len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            _ = GetWindowText(hWnd, sb, sb.Capacity);
            var title = sb.ToString().Trim();
            if (title.Length == 0) return true;

            if (!GetWindowRect(hWnd, out var r)) return true;
            var w = r.Right - r.Left;
            var h = r.Bottom - r.Top;
            if (w < minWidth || h < minHeight) return true;

            // skip tool windows & the shell tray
            var exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            if ((exStyle & WS_EX_TOOLWINDOW) != 0) return true;
            const string shell = "Shell_TrayWnd";
            var cls = new StringBuilder(256);
            _ = GetClassName(hWnd, cls, cls.Capacity);
            if (cls.ToString() == shell) return true;

            result.Add(new NativeWindow(hWnd, title, r.Left, r.Top, w, h));
            return true;
        }, IntPtr.Zero);
        return result;
    }

    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOOLWINDOW = 0x00000080;

    private static bool IsCloaked(IntPtr hWnd)
    {
        // DWM cloaked attribute — hides invisible UWP host windows on Win10/11
        try
        {
            if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out var cloaked, sizeof(int)) != 0)
                return false;
            return cloaked != 0;
        }
        catch (Exception) { return false; }
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", SetLastError = true)] private static extern long GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder name, int count);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);

    private const int DWMWA_CLOAKED = 14;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }
}
