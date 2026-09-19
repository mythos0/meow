using System;
using Microsoft.Win32;

namespace MeowCat.Platform;

/// <summary>
/// Launch-with-Windows support via the per-user Run key
/// (HKCU\Software\Microsoft\Windows\CurrentVersion\Run). Safe no-op on non-Windows.
/// </summary>
public static class AutoStart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "MeowCat";

    public static bool IsSupported => OperatingSystem.IsWindows();

    public static bool IsEnabled()
    {
        if (!IsSupported) return false;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(ValueName) is string path && path.Length > 0;
        }
        catch (Exception)
        {
            return false;
        }
    }

    /// <summary>Enables or disables launch-at-startup. Returns the resulting state.</summary>
    public static bool Set(bool enabled)
    {
        if (!IsSupported) return false;
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (key is null) return false;
            if (enabled)
            {
                var exe = Environment.ProcessPath;
                if (string.IsNullOrWhiteSpace(exe)) return false;
                key.SetValue(ValueName, $"\"{exe}\"");
            }
            else
            {
                key.DeleteValue(ValueName, throwOnMissingValue: false);
            }
            return enabled;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
