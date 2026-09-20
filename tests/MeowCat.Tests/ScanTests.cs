// ScanTests.cs — window-list → platform filters (pure part of the scanner).

namespace MeowCat.Tests;

using System.Collections.Generic;
using MeowCat.Core.Scan;
using Xunit;

public class ScanTests
{
    [Fact]
    public void ToPlatforms_filters_and_sorts()
    {
        var list = new List<RawWindow>
        {
            new("Visual Studio", 0, 0, 1600, 900),
            new("Notepad", 100, 100, 1499, 400),
            new("tiny", 0, 0, 100, 50),                     // too small
            new("MeowCat Settings", 0, 0, 800, 600),        // self excluded
            new("NVIDIA GeForce Overlay", 0, 0, 900, 700),  // excluded
            new("Program Manager", 0, 0, 1920, 1040),       // excluded (desktop)
            new("Edge", 50, 50, 1500, 800),
        };
        var plats = ScanPure.ToPlatforms(list);
        Assert.Equal(3, plats.Count);                        // VS, Notepad, Edge
        Assert.Equal(1600 * 900, plats[0].W * plats[0].H);   // sorted by area desc
        Assert.DoesNotContain(plats, p => p.Title == "MeowCat Settings");
    }

    [Fact]
    public void ToPlatforms_caps_at_max()
    {
        var list = new List<RawWindow>();
        for (int i = 0; i < 40; i++) list.Add(new RawWindow($"w{i}", i, i, 200 + i, 200 + i));
        Assert.Equal(24, ScanPure.ToPlatforms(list).Count);
    }

    [Fact]
    public void Null_and_empty_are_safe()
    {
        Assert.Empty(ScanPure.ToPlatforms(null));
        Assert.Empty(ScanPure.ToPlatforms(new List<RawWindow>()));
    }
}
