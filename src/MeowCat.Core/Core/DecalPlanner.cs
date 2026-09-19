using System;
using System.Collections.Generic;

namespace MeowCat.Core;

/// <summary>One glass-crack decal placement (virtual-screen DIU coords, top-left of art).</summary>
public sealed record DecalSpec(
    string Asset,          // file name inside Assets/sprites/_fx
    double CenterX,
    double CenterY,
    double RotationDeg,
    double Scale)          // 1.0 = full art width 512 DIU * host factor
{
    public const double ArtSize = 512;
}

/// <summary>
/// Pure placement logic for the angry scratch attack: given the point the cat swiped at,
/// produce 1 spiderweb shatter + 2 long claw gouges, randomly rotated/scaled, clamped to
/// the visible screen. Deterministic given the rng — unit-tested.
/// </summary>
public static class DecalPlanner
{
    public const string Shatter1 = "crack_shatter.png";
    public const string Shatter2 = "crack_shatter2.png";
    public const string Claws1 = "crack_claws.png";
    public const string Claws2 = "crack_claws2.png";

    public const int MaxDecals = 18;          // overlay cap (oldest removed first)
    public const double ShatterScale = 1.15;  // shatter art ≈ 590 DIU wide
    public const double ClawScaleMin = 0.55;
    public const double ClawScaleMax = 0.95;

    /// <summary>Builds the decal batch for one scratch attack around (x, y).</summary>
    public static IReadOnlyList<DecalSpec> Plan(double x, double y, double screenW, double screenH, Random rng)
    {
        var shatter = rng.Next(2) == 0 ? Shatter1 : Shatter2;
        var list = new List<DecalSpec>
        {
            new(shatter,
                Clamp(x + Rand(rng, -40, 40), 130, Math.Max(130, screenW - 130)),
                Clamp(y + Rand(rng, -40, 40), 130, Math.Max(130, screenH - 130)),
                Rand(rng, -22, 22), ShatterScale + rng.NextDouble() * 0.25)
        };

        var claws = rng.Next(2) == 0 ? Claws1 : Claws2;
        var baseRot = Rand(rng, -35, 35);
        for (var i = 0; i < 2; i++)
        {
            var ang = (baseRot + i * 18.0) * Math.PI / 180.0;
            var dist = 170 + rng.NextDouble() * 120;
            list.Add(new DecalSpec(claws,
                Clamp(x + Math.Cos(ang) * dist, 90, Math.Max(90, screenW - 90)),
                Clamp(y + Math.Sin(ang) * dist - 40, 90, Math.Max(90, screenH - 90)),
                baseRot + Rand(rng, -12, 12),
                ClawScaleMin + rng.NextDouble() * (ClawScaleMax - ClawScaleMin)));
        }
        return list;
    }

    /// <summary>Trims the running decal list to <see cref="MaxDecals"/> (drop oldest).</summary>
    public static void Cap(List<DecalSpec> decals)
    {
        if (decals.Count > MaxDecals)
            decals.RemoveRange(0, decals.Count - MaxDecals);
    }

    private static double Rand(Random rng, double lo, double hi) => lo + rng.NextDouble() * (hi - lo);

    private static double Clamp(double v, double lo, double hi) => Math.Clamp(v, lo, hi);
}
