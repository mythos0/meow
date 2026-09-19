using System;
using MeowCat.Core;

namespace MeowCat.Rendering;

public enum EyeStyle { Open, Blink, Closed, Happy, Wide }

/// <summary>All per-frame skeletal offsets, computed from state + time. Pure math.</summary>
public readonly record struct Pose(
    double BodyDx, double BodyDy, double BodyRot, double BodySquash,
    double HeadDx, double HeadDy, double HeadRot, double EarRot,
    double LegFL, double LegFR, double LegBL, double LegBR,   // degrees, + = forward
    double TailAngle, double TailCurl,                         // degrees from horizontal-back, 0..1 wrap
    EyeStyle Eyes, bool Blush,
    double ShadowShrink, double HeadBobTilt                    // secondary head tilt (deg)
);

/// <summary>
/// Orchestrates one frame of the cat: computes the <see cref="Pose"/> from state + time, then hands
/// off to <see cref="CatPainter"/>. All animation curves live here — realistic gait, breathing,
/// jump squash-and-stretch, tail follow-through.
/// </summary>
public static class CatRenderer
{
    public const double CanvasW = 210;
    public const double CanvasH = 190;
    public const double FeetY = 160;
    public const double HeadCX = 114;   // head center biased toward facing side
    public const double HeadCY = 64;
    public const double HeadR = 40;

    public static void Render(System.Windows.Media.DrawingContext dc, RenderSpec spec)
    {
        var pose = GetPose(spec.State, spec.Time, spec.AirHeight, spec.Vy);
        CatPainter.Paint(dc, spec, pose);
    }

    /// <summary>Blink scheduler shared by every pose.</summary>
    public static bool WantsBlink(double t) => (t % 3.7) < 0.13 || ((t + 1.3) % 7.9) < 0.10;

    public static Pose GetPose(CatState state, double t, double airHeight = 0, double vy = 0)
    {
        var blink = WantsBlink(t);
        var breathe = 1.0 + 0.013 * Math.Sin(2 * Math.PI * 0.30 * t);
        var tailIdle = 46 + Math.Sin(2 * Math.PI * 0.42 * t) * 12;

        return state switch
        {
            CatState.Walking => Walk(t, blink),
            CatState.Running or CatState.ChasingCursor => Run(t, blink, state == CatState.ChasingCursor),
            CatState.Sitting => Sit(t, blink),
            CatState.Sleeping => Sleep(t),
            CatState.Dancing => Dance(t),
            CatState.Jumping => Jump(t, airHeight, vy),
            CatState.PlayingYarn => Yarn(t, blink),
            CatState.Scratching => Scratch(t),
            CatState.Petted or CatState.FeedHappy => Happy(t, state == CatState.FeedHappy),
            CatState.Dragged => Drag(t),
            _ => Idle(t, blink, breathe, tailIdle)
        };
    }

    // -------------------------------------------------------------- poses

    private static Pose Walk(double t, bool blink)
    {
        var p = 2 * Math.PI * 1.6 * t;                       // gait 1.6 Hz
        var swing = 18.0;
        var fl = Math.Sin(p) * swing;                        // diagonal pairs (realistic gait)
        var br = fl;
        var fr = Math.Sin(p + Math.PI) * swing;
        var bl = fr;
        var bob = -Math.Abs(Math.Sin(p)) * 2.2;              // body rises mid-stride
        return new Pose(
            0, bob, 0, 1.0,
            0, bob * 0.55, 0, 0,
            fl, fr, bl, br,
            46 + Math.Sin(2 * Math.PI * 0.8 * t) * 14, 0.10,
            blink ? EyeStyle.Blink : EyeStyle.Open, false,
            1.0, Math.Sin(p) * 1.5);
    }

    private static Pose Run(double t, bool blink, bool chasing)
    {
        var p = 2 * Math.PI * 2.6 * t;
        var swing = 26.0;
        var fl = Math.Sin(p) * swing;
        var br = fl;
        var fr = Math.Sin(p + Math.PI) * swing;
        var bl = fr;
        var bob = -Math.Abs(Math.Sin(p)) * 3.2;
        return new Pose(
            0, bob, 6, 1.0,                                  // forward lean
            0, bob * 0.6, 2, -14,                            // ears swept back
            fl, fr, bl, br,
            chasing ? 12 + Math.Sin(p) * 6 : 30 + Math.Sin(p) * 18, chasing ? 0.02 : 0.05,
            blink ? EyeStyle.Blink : EyeStyle.Open, false,
            1.0, 2);
    }

    private static Pose Sit(double t, bool blink)
    {
        return new Pose(
            0, 10, -14, 0.94,
            2, 2, 0, Math.Sin(2 * Math.PI * 0.3 * t) * 2,
            0, 0, 78, 80,                                    // rear legs folded under
            150 + Math.Sin(2 * Math.PI * 0.25 * t) * 8, 0.85, // tail wrapped to the front
            blink ? EyeStyle.Blink : EyeStyle.Open, false,
            1.0, 0);
    }

    private static Pose Sleep(double t)
    {
        var breathe = 1.0 + 0.05 * Math.Sin(2 * Math.PI * 0.17 * t);
        return new Pose(
            0, 30, 0, 1.16 * breathe,                        // lying flat, slow breathing
            6, 24, 10, -6,
            84, 84, 84, 84,                                  // legs fully folded
            168, 1.0,
            EyeStyle.Closed, false,
            1.0, 0);
    }

    private static Pose Dance(double t)
    {
        var p = 2 * Math.PI * 2.0 * t;
        var bounce = -Math.Abs(Math.Sin(p)) * 8;
        return new Pose(
            0, bounce, Math.Sin(p) * 12, 1.0,
            0, bounce * 0.7, Math.Sin(p) * 6, Math.Sin(p) * 8,
            -52 + Math.Sin(p) * 26, -52 - Math.Sin(p) * 26,  // front paws pump alternately
            Math.Sin(p) * 10, Math.Sin(p + Math.PI) * 10,
            60 + Math.Sin(2 * Math.PI * 4.0 * t) * 25, 0.15,
            EyeStyle.Happy, false,
            1.0, Math.Sin(p) * 4);
    }

    private static Pose Jump(double t, double airHeight, double vy)
    {
        var squash = 1.0;
        double legs;
        EyeStyle eyes;
        if (vy < -60)      { legs = -18; squash = 1.08; eyes = EyeStyle.Wide; }   // takeoff: stretched
        else if (vy > 140) { legs = 14;  squash = 1.05; eyes = EyeStyle.Wide; }   // diving
        else if (Math.Abs(vy) <= 60) { legs = 46; squash = 0.90; eyes = EyeStyle.Wide; } // apex tuck
        else               { legs = -6;  squash = 0.96; eyes = EyeStyle.Wide; }   // falling
        var shrink = Math.Clamp(1 - airHeight / 180.0, 0.35, 1.0);
        return new Pose(
            0, 0, vy > 0 ? 4 : -4, squash,
            0, -2, 0, -10,
            legs, legs, legs, legs,
            75, 0.05,
            eyes, false,
            shrink, 0);
    }

    private static Pose Yarn(double t, bool blink)
    {
        var bat = Math.Sin(2 * Math.PI * 2.0 * t);
        return new Pose(
            0, 12, 4, 0.96,                                  // crouched over the ball
            8, 4, 4, 0,
            -14 + bat * 34, 8, 66, 70,                       // one paw bats, rear tucked
            40 + bat * 8, 0.15,
            blink ? EyeStyle.Blink : EyeStyle.Open, false,
            1.0, 2);
    }

    private static Pose Scratch(double t)
    {
        var p = 2 * Math.PI * 4.0 * t;
        return new Pose(
            0, -4, -8, 1.0,                                  // reared up against the wall
            4, -4, 0, -4,
            -34 + Math.Sin(p) * 22, -34 - Math.Sin(p) * 22, 0, 0,  // fast alternating paws up
            70, 0.1,
            EyeStyle.Open, false,
            1.0, 0);
    }

    private static Pose Happy(double t, bool feeding)
    {
        var wig = Math.Sin(2 * Math.PI * 3.0 * t) * 4;
        var bounce = -Math.Abs(Math.Sin(2 * Math.PI * 3.0 * t)) * (feeding ? 5 : 3);
        return new Pose(
            0, 10 + bounce, -14 + wig, 0.94,
            2, 2 + bounce * 0.5, wig, 6,
            0, 0, 78, 80,
            150 + wig * 2, 0.85,
            EyeStyle.Happy, true,                            // ^^ eyes + blush
            1.0, 0);
    }

    private static Pose Drag(double t)
    {
        var sway = Math.Sin(2 * Math.PI * 1.5 * t) * 8;
        return new Pose(
            0, -14, sway, 1.0,
            0, -4, sway * 0.4, -12,                          // ears back (surprised)
            6 + sway * 0.5, -6 + sway * 0.5, 10 + sway * 0.5, -10 + sway * 0.5, // dangling
            80 + sway * 0.6, 0.05,
            EyeStyle.Wide, false,
            0.8, 0);
    }

    private static Pose Idle(double t, bool blink, double breathe, double tail)
    {
        return new Pose(
            0, 0, 0, breathe,
            0, 0, Math.Sin(2 * Math.PI * 0.22 * t) * 3, 0,   // occasional look-around head tilt
            0, 0, 0, 0,
            tail, 0.12,
            blink ? EyeStyle.Blink : EyeStyle.Open, false,
            1.0, 0);
    }
}
