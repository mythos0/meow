// ScanPure.cs — pure window-list parsing/filtering for the platform scanner.
// Port of window-scan.js parseWindowsJson/toPlatforms. The WPF host feeds real
// EnumWindows rects; these functions turn them into brain platforms. Pure and
// unit-testable (no P/Invoke here).

namespace MeowCat.Core.Scan;

using System.Text.RegularExpressions;

public sealed record RawWindow(string Title, double X, double Y, double W, double H);

public static class ScanPure
{
    private static readonly Regex ExcludeRe = new(
        "meowcat|program manager|windows (input|shell experience|default lockscreen)|nvidia|geforce|msi afterburner|notification center|nexus",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Turn raw enumerated windows into platform candidates.</summary>
    public static List<RawWindow> ToPlatforms(IEnumerable<RawWindow>? list,
                                              double minW = 150, double minH = 100, int max = 24)
    {
        return (list ?? Enumerable.Empty<RawWindow>())
            .Where(w => w.W >= minW && w.H >= minH && !ExcludeRe.IsMatch(w.Title))
            .OrderByDescending(w => w.W * w.H)
            .Take(max)
            .ToList();
    }
}
