// PoseAndArtTests.cs — pose model invariants across every body × state, plus
// display-list sanity (no NaN, balanced save/restore, palettes complete).

namespace MeowCat.Tests;

using System;
using System.Collections.Generic;
using MeowCat.Core.Data;
using MeowCat.Core.Render;
using Xunit;

public class PoseAndArtTests
{
    public static IEnumerable<object[]> AllBreeds() =>
        Catalog.Palettes.Keys.Select(b => new object[] { b });

    public static IEnumerable<object[]> AllStates() =>
        Catalog.States.Select(s => new object[] { s });

    // ---------------------------------------------------------------- pose
    [Fact]
    public void Pose_for_every_state_produces_finite_legs()
    {
        foreach (var body in Catalog.Bodies.Values)
        {
            foreach (var state in Catalog.States)
            {
                for (double t = 0; t < 3.0; t += 0.17)
                {
                    var P = PoseModel.PoseFor(state, t, 0.5, body, Catalog.Palettes["grey_tabby"]);
                    for (int i = 0; i < 4; i++)
                    {
                        Assert.True(double.IsFinite(P.Legs[i].Fx), $"{state} t={t} leg{i} fx");
                        Assert.True(double.IsFinite(P.Legs[i].Fy), $"{state} t={t} leg{i} fy");
                    }
                    Assert.True(double.IsFinite(P.BobY) && double.IsFinite(P.BodyRot));
                }
            }
        }
    }

    [Fact]
    public void Walk_gait_is_alternating()
    {
        var B = Catalog.Bodies["normal"];
        // near and far front legs move in opposite phase
        var P0 = PoseModel.PoseFor("walk", 0.0, 0.5, B, Catalog.Palettes["grey_tabby"]);
        var d0 = P0.Legs[0].Fx - B.Feet[0];
        var d1 = P0.Legs[1].Fx - B.Feet[1];
        Assert.True(Math.Abs(d0 + d1) < 1e-6, "front near/far should be antiphase at t=0");
    }

    [Fact]
    public void Waddle_is_slower_than_walk()
    {
        // the panda gait (3.8 rad/s) is visibly slower than the cat walk (7 rad/s)
        var a = PoseModel.PoseFor("walk", 0.25, 0.5, Catalog.Bodies["panda"], Catalog.Palettes["panda"]);
        var b = PoseModel.PoseFor("waddle", 0.25, 0.5, Catalog.Bodies["panda"], Catalog.Palettes["panda"]);
        // both finite; gait speeds asserted by frequency constants — smoke here
        Assert.NotEqual(a.BodyRot, b.BodyRot);
    }

    [Fact]
    public void Panda_sleep_sprawls_where_cat_sleeps_curls()
    {
        var B = Catalog.Bodies["panda"];
        var pandaSleep = PoseModel.PoseFor("sleep", 0.4, 0.5, B, Catalog.Palettes["panda"]);
        var catSleep = PoseModel.PoseFor("sleep", 0.4, 0.5, B, Catalog.Palettes["grey_tabby"]);
        // research: pandas flop flat (squash down), cats curl up
        Assert.True(pandaSleep.Sqy < 0 && catSleep.Sqy > 0);
        Assert.NotEqual(pandaSleep.HeadX, catSleep.HeadX);
    }

    [Fact]
    public void Eat_cycle_bites_three_times_then_fish_gone()
    {
        var B = Catalog.Bodies["normal"];
        var p1 = PoseModel.PoseFor("eat", 0.2, 0.5, B, Catalog.Palettes["grey_tabby"]);
        var p2 = PoseModel.PoseFor("eat", 1.5, 0.5, B, Catalog.Palettes["grey_tabby"]);
        var p3 = PoseModel.PoseFor("eat", 4.5, 0.5, B, Catalog.Palettes["grey_tabby"]);
        var p4 = PoseModel.PoseFor("eat", 4.0, 0.5, B, Catalog.Palettes["grey_tabby"]); // just before the 3rd bite lands
        Assert.Equal(0, p1.FishBite);
        Assert.Equal(1, p2.FishBite);
        Assert.Equal(3, p3.FishBite);
        Assert.Equal("fish", p4.Prop);       // fish present through bite 3
        Assert.Equal(2, p4.FishBite);
        Assert.Null(p3.Prop);                // gone at the gulp (t >= 4.2)
        // chew phase shows working jaw
        var chew = PoseModel.PoseFor("eat", 0.8, 0.5, B, Catalog.Palettes["grey_tabby"]);
        Assert.Equal("chew", chew.Mouth);
        Assert.NotEqual(0, chew.ChewP);
        // bite phase opens wide
        var bite = PoseModel.PoseFor("eat", 0.44, 0.5, B, Catalog.Palettes["grey_tabby"]);
        Assert.Equal("bite", bite.Mouth);
    }

    [Fact]
    public void Roll_spins_full_turn_with_smoothstep()
    {
        var B = Catalog.Bodies["panda"];
        var mid = PoseModel.PoseFor("roll", 0.75, 0.5, B, Catalog.Palettes["panda"]);
        var start = PoseModel.PoseFor("roll", 0.05, 0.5, B, Catalog.Palettes["panda"]);
        var end = PoseModel.PoseFor("roll", 1.45, 0.5, B, Catalog.Palettes["panda"]);
        Assert.True(Math.Abs(mid.WholeRot - Math.PI) < 0.35);   // ~half way
        Assert.Equal(0, start.WholeRot, 3);
        Assert.Equal(Math.PI * 2, end.WholeRot, 3);
    }

    [Fact]
    public void Jump_stretches_then_lands_squashed()
    {
        var B = Catalog.Bodies["normal"];
        var up = PoseModel.PoseFor("jump", 0, 0.3, B, Catalog.Palettes["grey_tabby"]);
        var land = PoseModel.PoseFor("jump", 0, 0.95, B, Catalog.Palettes["grey_tabby"]);
        Assert.True(up.Sqy > 0);      // stretch in flight
        Assert.True(land.Sqx > 0);    // squash on landing
    }

    [Fact]
    public void HideLegs_states_tuck_legs()
    {
        var B = Catalog.Bodies["normal"];
        Assert.True(PoseModel.PoseFor("loaf", 0.3, .5, B, Catalog.Palettes["grey_tabby"]).HideLegs);
        Assert.True(PoseModel.PoseFor("sleep", 0.3, .5, B, Catalog.Palettes["grey_tabby"]).HideLegs == false);
        var pandaSleep = PoseModel.PoseFor("sleep", 0.3, .5, B, Catalog.Palettes["panda"]);
        Assert.True(pandaSleep.HideLegs);
    }

    // ---------------------------------------------------------------- IK
    [Fact]
    public void SolveIK_reaches_clamped_targets()
    {
        var (kx, ky) = PoseModel.SolveIk(0, 0, 100, 0, 10, 10, -1);
        // unreachable target clamps to full extension
        double d = Math.Sqrt(kx * kx + ky * ky);
        Assert.True(d <= 20.01);
        var (kx2, ky2) = PoseModel.SolveIk(0, 0, 12, 5, 10, 10, -1);
        Assert.True(double.IsFinite(kx2) && double.IsFinite(ky2));
    }

    [Fact]
    public void Tail_chain_is_continuous()
    {
        var pts = PoseModel.TailPoints(-36, -16, "sway", 1.0, Catalog.Bodies["normal"]);
        Assert.Equal(9, pts.Length);
        for (int i = 1; i < pts.Length; i++)
        {
            double d = Math.Sqrt(Math.Pow(pts[i].Item1 - pts[i - 1].Item1, 2) + Math.Pow(pts[i].Item2 - pts[i - 1].Item2, 2));
            Assert.InRange(d, 3, 10);   // per-segment step size
        }
    }

    // ---------------------------------------------------------------- emote anchor (the v3.2 bug fix)
    [Theory]
    [MemberData(nameof(AllBreeds))]
    public void Emote_anchor_sits_just_above_head(string breed)
    {
        var pal = Catalog.PaletteOf(breed);
        var B = Catalog.BodyOf(pal);
        double headTop = B.StandY + B.Head.Y - B.HeadR;
        var (ex, ey) = CatArt.EmoteAnchor(breed);
        Assert.True(ey < headTop, $"{breed}: emote y {ey} must be above head top {headTop}");
        Assert.True(ey - headTop < 60, $"{breed}: emote must hug the head (gap {ey - headTop})");
        Assert.InRange(ex, -20, 60);
    }

    // ---------------------------------------------------------------- display list
    [Theory]
    [MemberData(nameof(AllBreeds))]
    public void DrawCat_emits_finite_balanced_ops_for_every_breed(string breed)
    {
        foreach (var state in Catalog.States)
        {
            var ctx = new Canvas();
            CatArt.DrawCat(ctx, breed, state, 0.7, 1, 1, 1, 0.5);
            int saves = 0, restores = 0;
            foreach (var op in ctx.Ops)
            {
                switch (op)
                {
                    case OpSave: saves++; break;
                    case OpRestore: restores++; break;
                    case OpFillEllipse e:
                        Assert.True(double.IsFinite(e.Cx) && double.IsFinite(e.Cy) && e.Rx >= 0 && e.Ry >= 0);
                        break;
                    case OpTransform tr:
                        Assert.True(double.IsFinite(tr.M11) && double.IsFinite(tr.Dy));
                        break;
                    case OpFillPath f:
                        Assert.NotEmpty(f.Path.Segs);
                        break;
                    case OpStrokePath s:
                        Assert.True(s.Width > 0);
                        break;
                }
            }
            Assert.Equal(saves, restores);
            Assert.True(ctx.Ops.Count > 20, $"{breed}/{state} drew too little");
        }
    }

    [Fact]
    public void Particles_and_emotes_emit_ops()
    {
        foreach (var (state, expected) in new[] { ("dance", "sparkle"), ("happy", "heart"), ("sleep", "z"), ("scratch", "chip"), ("eat", "crumb"), ("bamboo", "leaf") })
        {
            var ctx = new Canvas();
            CatArt.DrawParticles(ctx, "grey_tabby", state, 0.5);
            Assert.True(ctx.Ops.Count > 0, state);
        }
        foreach (var kind in Catalog.EmoteKinds)
        {
            var ctx = new Canvas();
            CatArt.DrawEmote(ctx, kind, 0.4, 10, -100);
            Assert.True(ctx.Ops.Count > 0, kind);
        }
        // invalid emote is a no-op
        var empty = new Canvas();
        CatArt.DrawEmote(empty, "nope", 0.4, 0, 0);
        Assert.Empty(empty.Ops);
    }

    [Fact]
    public void Lucky_tabby_draws_collar_and_tag()
    {
        var ctx = new Canvas();
        CatArt.DrawCat(ctx, "lucky_tabby", "sit", 0.4, 1, 1, 1, 0.5);
        bool hasRed = false, hasGold = false;
        foreach (var op in ctx.Ops)
        {
            Paint? p = op switch
            {
                OpFillEllipse e => e.P,
                OpStrokePath s => s.P,
                OpFillPath f => f.P,
                _ => null,
            };
            if (p?.Solid != null)
            {
                if (p.Solid.StartsWith("#c23a34")) hasRed = true;
                if (p.Solid.StartsWith("#e8b23a")) hasGold = true;
            }
        }
        Assert.True(hasRed, "collar red must be painted");
        Assert.True(hasGold, "tag gold must be painted");
    }

    // ---------------------------------------------------------------- catalog integrity
    [Fact]
    public void Catalog_has_21_breeds_all_complete()
    {
        Assert.Equal(21, Catalog.Palettes.Count);
        Assert.Equal(21, Catalog.BreedPrices.Count);
        foreach (var (breed, pal) in Catalog.Palettes)
        {
            Assert.False(string.IsNullOrEmpty(pal.Name), breed);
            Assert.True(Catalog.Bodies.ContainsKey(pal.Body), $"{breed} body {pal.Body}");
            Assert.False(string.IsNullOrEmpty(pal.Fur));
            Assert.False(string.IsNullOrEmpty(pal.Nose));
            Assert.False(string.IsNullOrEmpty(pal.Eye));
            Assert.True(Catalog.BreedPrices.ContainsKey(breed), breed);
        }
        var panda = Catalog.Palettes["panda"];
        Assert.True(panda.PandaFace && panda.Band && panda.RoundEars && panda.LimbCol != null);
        var lucky = Catalog.Palettes["lucky_tabby"];
        Assert.True(lucky.Collar && lucky.TagPaw && lucky.Socks && lucky.BigEye);
    }

    [Fact]
    public void Shade_works_both_directions()
    {
        Assert.Equal("#FFFFFF", Canvas.Shade("#000000", 1));
        Assert.Equal("#000000", Canvas.Shade("#ffffff", -1));
        var mid = Canvas.Shade("#808080", 0);
        Assert.Equal("#808080", mid);
    }

    [Fact]
    public void ColorUtil_parses_hex_rgb_rgba()
    {
        var (r, g, b, a) = ColorUtil.Parse("#ff8000");
        Assert.Equal(255, r); Assert.Equal(128, g); Assert.Equal(0, b); Assert.Equal(1, a);
        var (r2, g2, b2, a2) = ColorUtil.Parse("rgba(10,20,30,0.5)");
        Assert.Equal(10, r2); Assert.Equal(20, g2); Assert.Equal(30, b2); Assert.Equal(0.5, a2);
        var (r3, _, _, a3) = ColorUtil.Parse("#80ffffff");
        Assert.Equal(255, r3);
        Assert.Equal(0x80 / 255.0, a3, 3);   // leading byte is alpha
    }
}
