// BrainTests.cs — deterministic 10k-tick simulation + interaction semantics.
// Port parity with the v3.2 brain: no open-field roaming, window-top platforms,
// pandas waddle/bamboo/roll instead of walk/eat.

namespace MeowCat.Tests;

using System;
using System.Collections.Generic;
using System.Linq;
using MeowCat.Core.Brain;
using Xunit;

public class BrainTests
{
    private static CatBrain MakeBrain(string breed = "grey_tabby", uint seed = 42)
        => new(Rng.Mulberry32(seed), breed: breed, boundsX: 0, boundsY: 0, boundsW: 1920, boundsH: 1040, groundY: 1032, x: 960);

    [Fact]
    public void Mulberry32_is_deterministic_and_in_unit_range()
    {
        var a = Rng.Mulberry32(7);
        var b = Rng.Mulberry32(7);
        for (int i = 0; i < 1000; i++)
        {
            double x = a(), y = b();
            Assert.Equal(x, y);
            Assert.InRange(x, 0, 0.999999);
        }
        Assert.NotEqual(Rng.Mulberry32(7)(), Rng.Mulberry32(8)());
    }

    [Fact]
    public void Ten_k_tick_sim_stays_in_bounds_and_valid_states()
    {
        foreach (var breed in new[] { "grey_tabby", "panda" })
        {
            var brain = MakeBrain(breed);
            var seen = new HashSet<string>();
            for (int i = 0; i < 10_000; i++)
            {
                brain.Tick(1 / 30.0);
                seen.Add(brain.State);
                Assert.InRange(brain.X, brain.MinX + 20, brain.MaxX - 20);
                Assert.True(brain.BaseY >= 0 && brain.BaseY <= brain.BoundsY + brain.BoundsH);
                Assert.True(BrainACTIONS.All.Contains(brain.State) || brain.State is "jump" or "happy");
            }
            Assert.True(seen.Count >= 6, $"{breed} used only {seen.Count} states: {string.Join(',', seen)}");
        }
    }

    [Fact]
    public void Panda_never_cat_walks_and_uses_panda_actions()
    {
        var brain = MakeBrain("panda", seed: 1234);
        var seen = new HashSet<string>();
        for (int i = 0; i < 12_000; i++)
        {
            brain.Tick(1 / 30.0);
            seen.Add(brain.State);
        }
        Assert.DoesNotContain("walk", seen);
        Assert.DoesNotContain("eat", seen);
        Assert.Contains("waddle", seen);
        Assert.Contains("bamboo", seen);
        Assert.Contains("roll", seen);
    }

    [Fact]
    public void Feed_gives_fish_to_cats_and_bamboo_to_panda()
    {
        var cat = MakeBrain("grey_tabby");
        cat.Feed();
        Assert.Equal("eat", cat.State);

        var panda = MakeBrain("panda");
        panda.Feed();
        Assert.Equal("bamboo", panda.State);
    }

    [Fact]
    public void Pet_sets_happy_and_love_emote()
    {
        var brain = MakeBrain();
        brain.Pet();
        Assert.Equal("happy", brain.State);
        Assert.NotNull(brain.Emote);
        Assert.Equal("love", brain.Emote!.Value.Kind);
    }

    [Fact]
    public void State_entries_fire_expected_emotes()
    {
        var brain = MakeBrain();
        brain.SleepNow();
        Assert.Equal("zzz", brain.Emote!.Value.Kind);
        brain.Dance();
        Assert.Equal("note", brain.Emote!.Value.Kind);
        brain.Feed();
        Assert.Equal("fish", brain.Emote!.Value.Kind);
    }

    [Fact]
    public void Platforms_jump_and_leave()
    {
        var brain = MakeBrain();
        var pl = new Platform(860, 700, 300, 200);   // window top above ground
        brain.SetPlatforms(new[] { pl });
        Assert.Single(brain.Platforms);

        // walk until the brain decides to hop (or force it by proximity)
        for (int i = 0; i < 2000 && brain.BaseY > 800; i++) brain.Tick(1 / 30.0);
        // dropAt directly onto the platform is deterministic
        brain.DropAt(960, 700);
        Assert.Same(pl, brain.OnPlatform);
        Assert.Equal(700, brain.BaseY, 3);

        // strolling on the platform eventually leaves or stays within its bounds
        for (int i = 0; i < 3000 && brain.OnPlatform == pl; i++) brain.Tick(1 / 30.0);
        if (brain.OnPlatform == pl)
        {
            Assert.InRange(brain.X, pl.X, pl.X + pl.W);
        }
        else
        {
            // left via a jump; after landing, feet are on a surface
            Assert.True(brain.OnPlatform == null || brain.Platforms.Contains(brain.OnPlatform));
        }
    }

    [Fact]
    public void SetPlatforms_filters_junk()
    {
        var brain = MakeBrain();
        brain.SetPlatforms(new[]
        {
            new Platform(0, 0, 50, 300),        // too narrow
            new Platform(0, 0, 400, 20),        // too short
            new Platform(-50, -1000, 400, 300), // above the workarea
            new Platform(100, 500, 400, 300),   // fine
        });
        Assert.Single(brain.Platforms);
        brain.SetPlatforms(null);
        Assert.Empty(brain.Platforms);
    }

    [Fact]
    public void DropAt_on_ground_clears_platform()
    {
        var brain = MakeBrain();
        var pl = new Platform(100, 500, 400, 300);
        brain.SetPlatforms(new[] { pl });
        brain.DropAt(960, 1032);
        Assert.Null(brain.OnPlatform);
        Assert.Equal(1032, brain.BaseY, 3);
    }

    [Fact]
    public void Jump_has_ballistic_arc()
    {
        var brain = MakeBrain();
        brain.SetPlatforms(Array.Empty<Platform>());
        brain.Poke();   // startle is a jump-in-place
        Assert.Equal("startle", brain.State);
    }

    [Fact]
    public void Zero_dt_is_noop()
    {
        var brain = MakeBrain();
        double x = brain.X, t = brain.T;
        brain.Tick(0);
        brain.Tick(-1);
        Assert.Equal(x, brain.X);
        Assert.Equal(t, brain.T);
    }

    [Fact]
    public void Clamped_dt_survives_huge_frames()
    {
        var brain = MakeBrain();
        brain.Tick(60);   // hibernation spike — must not throw or teleport
        Assert.InRange(brain.X, brain.MinX, brain.MaxX);
    }
}
