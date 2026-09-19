using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace MeowCat.Platform;

/// <summary>
/// Best-effort positions of the desktop icons (folders/files on the wallpaper).
/// Uses the classic shell folder view: Progman → SHELLDLL_DefView → SysListView32,
/// reading each item position across the explorer.exe process boundary
/// (VirtualAllocEx + LVM_GETITEMPOSITION + ReadProcessMemory).
/// Returns physical pixel coordinates (top-left of each icon), or an empty list when
/// unavailable (non-Windows, elevated shell mismatch, wallpaper-only desktops) —
/// callers must fall back to a synthesized layout.
/// </summary>
public static class DesktopIcons
{
    private const uint LVM_FIRST = 0x1000;
    private const uint LVM_GETITEMCOUNT = LVM_FIRST + 4;
    private const uint LVM_GETITEMPOSITION = LVM_FIRST + 16;
    private const uint PROCESS_VM_OPERATION = 0x0008;
    private const uint PROCESS_VM_READ = 0x0010;
    private const uint PROCESS_VM_WRITE = 0x0020;
    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RELEASE = 0x8000;
    private const uint PAGE_READWRITE = 0x04;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string cls, string? title);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string? title);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wp, IntPtr lp);

    [DllImport("kernel32.dll")]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

    [DllImport("kernel32.dll")]
    private static extern IntPtr VirtualAllocEx(IntPtr proc, IntPtr addr, IntPtr size,
        uint type, uint protect);

    [DllImport("kernel32.dll")]
    private static extern bool VirtualFreeEx(IntPtr proc, IntPtr addr, IntPtr size, uint type);

    [DllImport("kernel32.dll")]
    private static extern bool ReadProcessMemory(IntPtr proc, IntPtr addr, byte[] buffer,
        IntPtr size, out IntPtr read);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    /// <summary>Icon positions in physical pixels relative to the desktop list view. May be empty.</summary>
    public static List<(int X, int Y)> GetIconPositions(int maxIcons = 64)
    {
        var result = new List<(int, int)>();
        if (!OperatingSystem.IsWindows()) return result;

        IntPtr lv = GetDesktopListView();
        if (lv == IntPtr.Zero) return result;

        try
        {
            GetWindowThreadProcessId(lv, out var pid);
            if (pid == 0) return result;

            var count = SendMessage(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
            if (count <= 0 || count > 512) return result;
            count = Math.Min(count, maxIcons);

            var proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, pid);
            if (proc == IntPtr.Zero) return result;
            try
            {
                var bufSize = Marshal.SizeOf<POINT>();
                var remote = VirtualAllocEx(proc, IntPtr.Zero, (IntPtr)bufSize, MEM_COMMIT, PAGE_READWRITE);
                if (remote == IntPtr.Zero) return result;
                try
                {
                    var buffer = new byte[bufSize];
                    for (var i = 0; i < count; i++)
                    {
                        var ok = SendMessage(lv, LVM_GETITEMPOSITION, (IntPtr)i, remote) != IntPtr.Zero;
                        if (!ok || !ReadProcessMemory(proc, remote, buffer, (IntPtr)bufSize, out var read)
                            || read.ToInt64() != bufSize)
                            continue;
                        var pt = MemoryMarshalRead<POINT>(buffer);
                        result.Add((pt.X, pt.Y));
                    }
                }
                finally { VirtualFreeEx(proc, remote, IntPtr.Zero, MEM_RELEASE); }
            }
            finally { CloseHandle(proc); }
        }
        catch (Exception)
        {
            // never let desktop decoration crash the cat
        }
        return result;
    }

    private static IntPtr GetDesktopListView()
    {
        try
        {
            var progman = FindWindow("Progman", null);
            if (progman == IntPtr.Zero) return IntPtr.Zero;
            var defView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (defView == IntPtr.Zero)
            {
                // rare: DefView lives in a sibling WorkerW window
                var worker = IntPtr.Zero;
                do
                {
                    worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null);
                    defView = worker == IntPtr.Zero ? IntPtr.Zero : FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);
                } while (defView == IntPtr.Zero && worker != IntPtr.Zero);
            }
            if (defView == IntPtr.Zero) return IntPtr.Zero;
            return FindWindowEx(defView, IntPtr.Zero, "SysListView32", "FolderView");
        }
        catch (Exception)
        {
            return IntPtr.Zero;
        }
    }

    private static T MemoryMarshalRead<T>(byte[] buffer) where T : struct
    {
        var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        try { return Marshal.PtrToStructure<T>(handle.AddrOfPinnedObject()); }
        finally { handle.Free(); }
    }

    /// <summary>
    /// Fallback layout when the real icon positions are unavailable: a standard
    /// Windows-style grid along the left edge of the desktop (physical px).
    /// </summary>
    public static List<(int X, int Y)> SynthLayout(int workAreaW, int workAreaH, int count)
    {
        var list = new List<(int, int)>();
        const int pitchX = 76, pitchY = 90, margin = 20;
        var rows = Math.Max(1, (workAreaH - margin * 2) / pitchY);
        var cols = Math.Max(1, (Math.Min(workAreaW, 800) - margin) / pitchX);
        for (var i = 0; i < count; i++)
        {
            var col = i / rows;
            if (col >= cols) col %= cols;
            var row = i % rows;
            list.Add((margin + col * pitchX + 35, margin + row * pitchY + 35));
        }
        return list;
    }
}
