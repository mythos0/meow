using System;
using System.Collections.Generic;
using System.Linq;

namespace MeowCat.Core;

public enum FurPattern { None, Tabby, Calico, Tuxedo, Points, Fluffy }

/// <summary>Color triplet for one breed, as hex strings (renderer maps to WPF brushes).</summary>
public sealed class BreedColors
{
    public string BodyLight { get; init; } = "#FFD9A66C";  // gradient highlight
    public string BodyDark { get; init; } = "#FFB97F42";   // gradient shade
    public string Belly { get; init; } = "#FFF3E2C7";      // muzzle/belly/chest
    public string Stripe { get; init; } = "#FF9C6431";     // stripes / patches
    public string EyeOuter { get; init; } = "#FF2E8B6E";   // iris gradient outer
    public string EyeInner { get; init; } = "#FF9FE8C0";   // iris gradient inner
    public string Nose { get; init; } = "#FFE88696";
    public FurPattern Pattern { get; init; } = FurPattern.None;
    public string Description { get; init; } = "";
}

public sealed record BreedDef(string Id, string Name, int Price, BreedColors Colors);

public sealed record AccessoryDef(string Id, string Name, int Price, string Slot, string Description);

public sealed record EmotePackDef(string Id, string Name, int Price, string Description);

/// <summary>The full Cat Store merchandise catalog. Static and immutable.</summary>
public static class SkinCatalog
{
    public static readonly IReadOnlyList<BreedDef> Breeds = new[]
    {
        new BreedDef("grey_tabby", "Grey Tabby", 0, new BreedColors
        {
            BodyLight = "#FF9AA2AC", BodyDark = "#FF6A727E", Belly = "#FFF5F3F0", Stripe = "#FF3E434B",
            EyeOuter = "#FFB07A1E", EyeInner = "#FFEFC25A", Nose = "#FFE08794",
            Pattern = FurPattern.Tabby, Description = "The star of the show. Fluffy, golden-eyed, always up to something."
        }),
        new BreedDef("orange_tabby", "Orange Tabby", 120, new BreedColors
        {
            BodyLight = "#FFE0A868", BodyDark = "#FFB8793C", Belly = "#FFF6E7CE", Stripe = "#FF9C6431",
            EyeOuter = "#FF2E8B6E", EyeInner = "#FFA9EFC6", Nose = "#FFE88696",
            Pattern = FurPattern.Tabby, Description = "The classic. Sunny, mischievous, always hungry."
        }),
        new BreedDef("tuxedo", "Tuxedo Cat", 100, new BreedColors
        {
            BodyLight = "#FF4A4550", BodyDark = "#FF26222B", Belly = "#FFF4F2F5", Stripe = "#FF26222B",
            EyeOuter = "#FFC79A2E", EyeInner = "#FFF3D98B", Nose = "#FFD98A96",
            Pattern = FurPattern.Tuxedo, Description = "Born in a tiny suit. Extremely dignified."
        }),
        new BreedDef("calico", "Calico", 120, new BreedColors
        {
            BodyLight = "#FFF2E7DA", BodyDark = "#FFD9C4AC", Belly = "#FFFBF4EA", Stripe = "#FFD97C3B",
            EyeOuter = "#FFB77E2E", EyeInner = "#FFEFCF8B", Nose = "#FFEE9AA6",
            Pattern = FurPattern.Calico, Description = "Three colors of pure chaos. Brings good luck."
        }),
        new BreedDef("siamese", "Siamese", 140, new BreedColors
        {
            BodyLight = "#FFF0E3D0", BodyDark = "#FFCDB493", Belly = "#FFF8EFE2", Stripe = "#FF6B5140",
            EyeOuter = "#FF2B6FB0", EyeInner = "#FF9CD0F5", Nose = "#FF6B5140",
            Pattern = FurPattern.Points, Description = "Vocal aristocrat with sapphire eyes and dark points."
        }),
        new BreedDef("persian", "White Persian", 180, new BreedColors
        {
            BodyLight = "#FFF7F2EC", BodyDark = "#FFDCCFC2", Belly = "#FFFFFBF7", Stripe = "#FFE3D5C6",
            EyeOuter = "#FF3E6FA8", EyeInner = "#FFA9CDEF", Nose = "#FFEF9FAA",
            Pattern = FurPattern.Fluffy, Description = "A floating cloud with a flat face and endless fluff."
        }),
    };

    public static readonly IReadOnlyList<AccessoryDef> Accessories = new[]
    {
        new AccessoryDef("party_hat",    "Party Hat",    40, "Head", "Confetti cone. Every day is a birthday."),
        new AccessoryDef("top_hat",      "Top Hat",      60, "Head", "Formal wear for serious business naps."),
        new AccessoryDef("head_bow",     "Head Bow",     35, "Head", "A cheerful ribbon bow for the ear."),
        new AccessoryDef("bow_tie",      "Bow Tie",      35, "Neck", "Instant gentleman. No refunds on charm."),
        new AccessoryDef("glasses",      "Round Glasses",50, "Face", "Scholarly round spectacles. +10 wisdom."),
        new AccessoryDef("scarf",        "Cozy Scarf",   55, "Neck", "Knitted warmth for chilly desktops."),
    };

    public static readonly IReadOnlyList<EmotePackDef> EmotePacks = new[]
    {
        new EmotePackDef("hearts",   "Classic Hearts", 0,  "Love bubbles when you pet your cat."),
        new EmotePackDef("zzz",      "Zzz Clouds",     30, "Dreamy sleep symbols float above naps."),
        new EmotePackDef("music",    "Music Notes",    30, "Dance parties come with a soundtrack look."),
        new EmotePackDef("surprise", "Surprise !",     25, "Comic '!' pops for jumps and surprises."),
        new EmotePackDef("sparkles", "Sparkles",       45, "Twinkling stars for the fanciest cats."),
    };

    public const int MaxAccessories = 3;

    public static BreedDef? Breed(string id) => Breeds.FirstOrDefault(b => b.Id == id);
    public static AccessoryDef? Accessory(string id) => Accessories.FirstOrDefault(a => a.Id == id);
    public static EmotePackDef? EmotePack(string id) => EmotePacks.FirstOrDefault(e => e.Id == id);
    public static int ItemPrice(string id) =>
        Breed(id)?.Price ?? Accessory(id)?.Price ?? EmotePack(id)?.Price ?? int.MaxValue;

    /// <summary>Default free items every cat owns from the start.</summary>
    public static List<string> DefaultOwned() => new() { "grey_tabby", "hearts" };

    /// <summary>Catalog integrity — every id must be unique across the whole store.</summary>
    public static bool AllIdsUnique()
    {
        var ids = Breeds.Select(b => b.Id)
            .Concat(Accessories.Select(a => a.Id))
            .Concat(EmotePacks.Select(e => e.Id));
        return ids.Count() == ids.Distinct().Count();
    }
}
