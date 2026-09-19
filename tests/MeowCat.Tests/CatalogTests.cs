using System;
using System.IO;
using System.Linq;
using MeowCat.Core;
using Xunit;

namespace MeowCat.Tests;

public class SkinCatalogTests
{
    [Fact]
    public void Store_HasFullMerchandise()
    {
        Assert.Equal(6, SkinCatalog.Breeds.Count);
        Assert.Equal(6, SkinCatalog.Accessories.Count);
        Assert.Equal(5, SkinCatalog.EmotePacks.Count);
    }

    [Fact]
    public void AllIds_AreUnique_AcrossTheWholeStore()
    {
        Assert.True(SkinCatalog.AllIdsUnique());
    }

    [Fact]
    public void DefaultBreed_IsFree()
    {
        Assert.Equal(0, SkinCatalog.Breeds[0].Price);
        Assert.Equal("grey_tabby", SkinCatalog.Breeds[0].Id);
    }

    [Fact]
    public void Prices_AreSane()
    {
        Assert.All(SkinCatalog.Breeds, b => Assert.InRange(b.Price, 0, 500));
        Assert.All(SkinCatalog.Accessories, a => Assert.InRange(a.Price, 1, 500));
        Assert.All(SkinCatalog.EmotePacks, e => Assert.InRange(e.Price, 0, 500));
    }

    [Fact]
    public void Lookup_ById_Works()
    {
        Assert.NotNull(SkinCatalog.Breed("siamese"));
        Assert.NotNull(SkinCatalog.Accessory("top_hat"));
        Assert.NotNull(SkinCatalog.EmotePack("music"));
        Assert.Null(SkinCatalog.Breed("dog"));
    }

    [Fact]
    public void ItemPrice_KnowsEverything()
    {
        Assert.Equal(120, SkinCatalog.ItemPrice("calico"));
        Assert.Equal(60, SkinCatalog.ItemPrice("top_hat"));
        Assert.Equal(45, SkinCatalog.ItemPrice("sparkles"));
        Assert.Equal(int.MaxValue, SkinCatalog.ItemPrice("unknown"));
    }

    [Fact]
    public void MaxAccessories_IsThree()
    {
        Assert.Equal(3, SkinCatalog.MaxAccessories);
    }
}

public class SoundCatalogTests
{
    [Fact]
    public void EveryMappedSound_HasAnEntryFile()
    {
        var rng = new Random(7);
        foreach (CatState s in Enum.GetValues(typeof(CatState)))
        {
            var entry = SoundCatalog.EntryFor(s, rng);
            if (entry is not null) Assert.Contains(entry, SoundCatalog.AllFiles());
            var loop = SoundCatalog.LoopFor(s);
            if (loop is not null) Assert.Contains(loop, SoundCatalog.AllFiles());
        }
        // meow variants resolve to real files too
        foreach (var m in new[] { SoundCatalog.RandomMeow(rng), SoundCatalog.MeowReal,
                                  SoundCatalog.MeowReal2, SoundCatalog.MeowReal3 })
            Assert.Contains(m, SoundCatalog.AllFiles());
    }

    [Fact]
    public void AllSoundFiles_ExistInAssets()
    {
        var dir = FindSoundsDir();
        Assert.True(Directory.Exists(dir), $"missing SFX directory: {dir}");
        foreach (var f in SoundCatalog.AllFiles())
            Assert.True(File.Exists(Path.Combine(dir, f)), $"missing SFX file: {f}");
    }

    /// <summary>Locates src/MeowCat/Assets/sounds by walking up from the test output folder.</summary>
    private static string FindSoundsDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "src", "MeowCat", "Assets", "sounds");
            if (Directory.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        return Path.Combine(AppContext.BaseDirectory, "Assets", "sounds");
    }

    [Fact]
    public void LoopIntervals_ArePositive()
    {
        foreach (CatState s in Enum.GetValues(typeof(CatState)))
            Assert.True(SoundCatalog.LoopIntervalFor(s) > 0);
    }
}
