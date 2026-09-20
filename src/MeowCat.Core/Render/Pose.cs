// Pose.cs — pose model, exact port of cat-renderer.js poseFor(): every state
// is a pure function of (state, t, jumpP, body, palette). Legs use 2-bone IK
// from shoulder/hip to a foot target; tails are kinematic chains.

namespace MeowCat.Core.Render;

using MeowCat.Core.Data;

public sealed class FootTarget
{
    public double Fx, Fy;
}

public sealed class Pose
{
    public double BodyY, BobY, BodyRot, Sqx, Sqy, ShadowK = 1;
    public double HeadX, HeadY, HeadRot, WholeRot;
    public bool HideLegs;
    public string? Prop;                       // "bamboo" | "fish"
    public FootTarget[] Legs = null!;          // [frontNear, frontFar, backNear, backFar]
    public string TailMode = "sway";
    public string EyeState = "open";           // open | blink | closed | happy
    public string Mouth = "closed";            // closed | open | bite | chew | yawn
    public double ChewP, FishBite;
    public (string Kind, double F)? Particles;
    public double EarFlat;
}

public static class PoseModel
{
    public static Pose PoseFor(string state, double t, double jumpP, Catalog.BodyDef B, BreedPalette pal)
    {
        B ??= Catalog.Bodies["normal"];
        bool panda = pal?.PandaFace == true;
        var P = new Pose
        {
            Legs = new[] { new FootTarget(), new FootTarget(), new FootTarget(), new FootTarget() },
        };
        double[] F = B.Feet;
        double A = B.FootAmp;

        double W(double f, double ph) => Math.Sin(t * f + ph);

        switch (state)
        {
            case "walk":
            {
                const double f = 7.0;
                P.Legs[0].Fx = F[0] + W(f, 0) * A;               P.Legs[0].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI / 2)) * 6;
                P.Legs[1].Fx = F[1] + W(f, Math.PI) * A;         P.Legs[1].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 1.5)) * 6;
                P.Legs[2].Fx = F[2] + W(f, Math.PI * 1.15) * (A + 1); P.Legs[2].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 1.65)) * 6;
                P.Legs[3].Fx = F[3] + W(f, Math.PI * 0.15) * (A + 1); P.Legs[3].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 0.65)) * 6;
                P.BobY = -Math.Abs(W(f, 0)) * 2.2;
                P.BodyRot = W(f, Math.PI / 2) * 0.02;
                break;
            }
            case "run":
            {
                const double f = 12.5;
                P.Legs[0].Fx = F[0] + W(f, 0) * A * 1.7;   P.Legs[0].Fy = -Math.Max(0, Math.Sin(t * f + 1.7)) * 11;
                P.Legs[1].Fx = F[1] + W(f, Math.PI) * A * 1.7; P.Legs[1].Fy = -Math.Max(0, Math.Sin(t * f + 1.7 + Math.PI)) * 11;
                P.Legs[2].Fx = F[2] + W(f, Math.PI * 1.2) * (A + 8); P.Legs[2].Fy = -Math.Max(0, Math.Sin(t * f + 1.2 + Math.PI * 1.5)) * 12;
                P.Legs[3].Fx = F[3] + W(f, Math.PI * 0.2) * (A + 8); P.Legs[3].Fy = -Math.Max(0, Math.Sin(t * f + 1.2 + Math.PI * 0.5)) * 12;
                P.BobY = -Math.Abs(W(f, 0)) * 5;
                P.Sqx = W(f * 0.5, 0) * 0.05; P.Sqy = -P.Sqx;
                P.BodyRot = 0.06 + W(f, 1) * 0.03;
                P.TailMode = "stream";
                break;
            }
            case "idle":
            {
                P.BobY = Math.Sin(t * 2.1) * 0.8;
                P.EyeState = "blink";
                break;
            }
            case "sit":
            {
                P.BodyY = 4; P.BodyRot = 0.10;
                P.Sqx = -0.04; P.Sqy = 0.05;
                P.Legs[2].Fx = F[2] + 8; P.Legs[2].Fy = -2;
                P.Legs[3].Fx = F[3] + 10; P.Legs[3].Fy = -2;
                P.Legs[0].Fx = F[0] + 2; P.Legs[1].Fx = F[1] + 1;
                P.TailMode = "curl";
                P.EyeState = "blink";
                P.BobY = Math.Sin(t * 1.7) * 0.7;
                break;
            }
            case "sleep" when panda:
            {
                // pandas nap sprawled on side or belly (research) — flat-out flop
                P.BodyY = 24; P.BodyRot = 0.03;
                P.Sqx = 0.10; P.Sqy = -0.20;
                P.Legs[0].Fx = F[0] + 12;
                P.Legs[1].Fx = F[1] + 16; P.Legs[1].Fy = -2;
                P.Legs[2].Fx = F[2] + 14;
                P.Legs[3].Fx = F[3] + 18; P.Legs[3].Fy = -2;
                P.HideLegs = true;
                P.HeadX = -8; P.HeadY = 19; P.HeadRot = 0.20;
                P.TailMode = "wrap";
                P.EyeState = "closed";
                P.Particles = ("z", 1.1);
                break;
            }
            case "sleep":
            {
                P.BodyY = 18; P.BodyRot = 0.16;
                P.Sqx = -0.10; P.Sqy = 0.12;
                P.Legs[0].Fx = F[0] - 4; P.Legs[0].Fy = -2;
                P.Legs[1].Fx = F[1] - 6; P.Legs[1].Fy = -2;
                P.Legs[2].Fx = F[2] + 12; P.Legs[2].Fy = -2;
                P.Legs[3].Fx = F[3] + 14; P.Legs[3].Fy = -2;
                P.HeadX = -14; P.HeadY = 12; P.HeadRot = 0.18;
                P.TailMode = "wrap";
                P.EyeState = "closed";
                P.Particles = ("z", 1.1);
                break;
            }
            case "dance":
            {
                const double f = 6.2;
                P.BodyY = -2;
                P.BobY = -Math.Abs(W(f, 0)) * 9;
                P.BodyRot = W(f * 0.5, 0) * 0.10;
                P.Sqx = W(f, 0) * 0.05; P.Sqy = -P.Sqx;
                P.Legs[0].Fx = F[0] + W(f, 0) * 4; P.Legs[0].Fy = -Math.Max(0, W(f, 0.8)) * 16;
                P.Legs[1].Fx = F[1];               P.Legs[1].Fy = -Math.Max(0, W(f, 0.8 + Math.PI)) * 16;
                P.Legs[2].Fx = F[2] + W(f, Math.PI) * 3; P.Legs[2].Fy = -Math.Max(0, W(f, Math.PI + 0.8)) * 10;
                P.HeadRot = W(f * 0.5, 0.4) * 0.14;
                P.TailMode = "spiral";
                P.EyeState = "happy";
                P.Particles = ("sparkle", 5);
                break;
            }
            case "scratch":
            {
                const double f = 10.5;
                P.BodyY = -6; P.BodyRot = -0.16;
                P.Legs[2].Fx = F[2] + 4; P.Legs[2].Fy = -4;
                P.Legs[3].Fx = F[3] + 6; P.Legs[3].Fy = -4;
                P.Legs[0].Fx = F[0] + 6 + W(f, 0) * 7; P.Legs[0].Fy = -26 + Math.Abs(W(f, 0)) * 8;
                P.Legs[1].Fx = F[1] + 4 + W(f, Math.PI) * 7; P.Legs[1].Fy = -26 + Math.Abs(W(f, Math.PI)) * 8;
                P.HeadRot = -0.08 + W(f, 0) * 0.06;
                P.TailMode = "stream";
                P.Particles = ("chip", 9);
                break;
            }
            case "jump":
            {
                double p = Math.Min(1, Math.Max(0, jumpP));
                double stretch = Math.Sin(p * Math.PI);
                P.Sqx = -stretch * 0.12 + (p > 0.85 ? 0.10 : 0);
                P.Sqy = stretch * 0.14 - (p > 0.85 ? 0.10 : 0);
                P.Legs[0].Fy = -8 - stretch * 14; P.Legs[1].Fy = -8 - stretch * 14;
                P.Legs[2].Fy = -4 - stretch * 16; P.Legs[3].Fy = -4 - stretch * 16;
                P.Legs[0].Fx = F[0] + 4; P.Legs[1].Fx = F[1] + 4;
                P.Legs[2].Fx = F[2] + 4; P.Legs[3].Fx = F[3] + 4;
                P.BodyRot = -0.10 + p * 0.06;
                P.TailMode = "stream";
                break;
            }
            case "happy":
            {
                P.BobY = -Math.Abs(Math.Sin(t * 5)) * 5;
                P.Legs[0].Fy = -Math.Max(0, Math.Sin(t * 5)) * 10;
                P.Legs[1].Fy = -Math.Max(0, Math.Sin(t * 5 + Math.PI)) * 10;
                P.TailMode = "spiral";
                P.EyeState = "happy";
                P.Particles = ("heart", 3);
                break;
            }
            case "eat":
            {
                // v3.2 proper eating: a fish lies on the ground; each 1.4s cycle
                // the cat dips its head, BITES a chunk off (fish shrinks), chews
                // side-to-side with working cheeks, then swallows. 3 bites + gulp.
                double cyc = t % 1.4;
                int biteN = (int)Math.Min(3, Math.Floor(t / 1.4));
                P.BodyY = 2;
                P.Prop = biteN < 3 ? "fish" : null;
                P.FishBite = biteN;
                if (cyc < 0.5)                    // stalk the fish and bite
                {
                    double d = cyc / 0.5;
                    P.HeadY = 8 + d * 11; P.HeadX = 2; P.HeadRot = 0.20 + d * 0.16;
                    P.EyeState = "open";
                    P.Mouth = d > 0.70 ? "bite" : "open";
                    P.TailMode = "sway";
                }
                else if (cyc < 1.18)              // chew: side-to-side jaw
                {
                    double d = (cyc - 0.5) / 0.68;
                    P.HeadY = 19 - d * 8; P.HeadX = 2; P.HeadRot = 0.36 - d * 0.12;
                    P.Mouth = "chew";
                    P.ChewP = Math.Sin(t * 11.5);
                    P.EyeState = "closed";
                    P.Particles = ("crumb", 2);
                    P.TailMode = "curl";
                }
                else                              // swallow, satisfied blink
                {
                    P.HeadY = 11; P.HeadRot = 0.24;
                    P.Mouth = "closed";
                    P.EyeState = "blink";
                    P.TailMode = "curl";
                }
                break;
            }
            case "stretch":
            {   // downward-dog stretch: front low, rear up
                double breathe = W(1.3, 0) * 0.015;
                P.BodyY = 4; P.BodyRot = -0.30 + breathe;
                P.Sqx = 0.06; P.Sqy = -0.05;
                P.Legs[0].Fx = F[0] + 16; P.Legs[0].Fy = -2;
                P.Legs[1].Fx = F[1] + 14; P.Legs[1].Fy = -2;
                P.Legs[2].Fx = F[2] + 6; P.Legs[2].Fy = -8;
                P.Legs[3].Fx = F[3] + 6; P.Legs[3].Fy = -8;
                P.HeadY = 12; P.HeadRot = 0.14;
                P.TailMode = "curl";
                P.EyeState = "blink";
                break;
            }
            case "groom":
            {   // sitting, licking a raised front paw
                const double f = 3.2;
                double d = Math.Max(0, Math.Sin(t * f));
                P.BodyY = 6; P.BodyRot = 0.12;
                P.Sqx = -0.05; P.Sqy = 0.04;
                P.Legs[2].Fx = F[2] + 8; P.Legs[2].Fy = -2;
                P.Legs[3].Fx = F[3] + 10; P.Legs[3].Fy = -2;
                P.Legs[0].Fx = F[0] - 2; P.Legs[0].Fy = -18 - d * 6;  // raised paw
                P.Legs[1].Fx = F[1] + 2; P.Legs[1].Fy = -2;
                P.HeadY = 4 + d * 6; P.HeadX = 4; P.HeadRot = 0.30 + d * 0.20;
                P.Mouth = d > 0.62 ? "open" : "closed";
                P.EyeState = "closed";
                P.TailMode = "curl";
                break;
            }
            case "pounce":
            {   // play-crouch, butt-wiggle, then a little leap
                double cyc = (t % 1.7) / 1.7;
                if (cyc < 0.55)
                {
                    double wig = Math.Sin(t * 22) * 0.045 * Math.Min(1, cyc * 3);
                    P.BodyY = 8; P.BodyRot = -0.10;
                    P.Sqx = -0.06 + wig; P.Sqy = 0.08;
                    P.Legs[0].Fx = F[0] + 2; P.Legs[0].Fy = -4;
                    P.Legs[1].Fx = F[1] + 2; P.Legs[1].Fy = -4;
                    P.Legs[2].Fx = F[2] + 6; P.Legs[2].Fy = -2;
                    P.Legs[3].Fx = F[3] + 6; P.Legs[3].Fy = -2;
                    P.HeadY = 4; P.HeadRot = -0.06 + wig * 2;
                    P.TailMode = "spiral";
                }
                else
                {
                    double q = (cyc - 0.55) / 0.45;
                    double arc = Math.Sin(q * Math.PI);
                    P.BodyY = 8 - arc * 24;
                    P.BodyRot = -0.10 + q * 0.16;
                    P.Sqx = 0.05; P.Sqy = -0.04;
                    P.Legs[0].Fx = F[0] + 6; P.Legs[0].Fy = -10 - arc * 10;
                    P.Legs[1].Fx = F[1] + 6; P.Legs[1].Fy = -10 - arc * 10;
                    P.Legs[2].Fx = F[2] + 10; P.Legs[2].Fy = -6 - arc * 8;
                    P.Legs[3].Fx = F[3] + 10; P.Legs[3].Fy = -6 - arc * 8;
                    P.TailMode = "stream";
                }
                P.EyeState = "open";
                break;
            }
            case "knead":
            {   // making biscuits: alternating paw presses
                const double f = 2.6;
                double s = Math.Sin(t * f);
                P.BodyY = 4; P.BodyRot = 0.08;
                P.Sqx = -0.04; P.Sqy = 0.05;
                P.Legs[2].Fx = F[2] + 8; P.Legs[2].Fy = -2;
                P.Legs[3].Fx = F[3] + 10; P.Legs[3].Fy = -2;
                P.Legs[0].Fx = F[0] - 6; P.Legs[0].Fy = -10 - Math.Max(0, s) * 5;
                P.Legs[1].Fx = F[1] - 4; P.Legs[1].Fy = -10 - Math.Max(0, -s) * 5;
                P.HeadY = 3; P.HeadRot = 0.10;
                P.TailMode = "curl";
                P.EyeState = "happy";
                P.BobY = Math.Sin(t * f) * 0.6;
                break;
            }
            case "loaf":
            {   // full loaf: legs tucked under
                P.BodyY = 14; P.BodyRot = 0.02;
                P.Sqx = 0.06; P.Sqy = -0.16;
                P.HideLegs = true;
                P.HeadX = -2; P.HeadY = 6; P.HeadRot = 0.06;
                P.TailMode = "wrap";
                P.EyeState = "blink";
                P.BobY = Math.Sin(t * 1.6) * 0.5;
                break;
            }
            case "yawn":
            {   // big slow yawn
                double cyc = (t % 2.4) / 2.4;
                double d = Math.Sin(cyc * Math.PI);
                P.BodyY = 0;
                P.HeadY = -4 - d * 3; P.HeadRot = -0.12 - d * 0.10;
                P.Mouth = d > 0.35 ? "yawn" : "closed";
                P.EyeState = "closed";
                P.Sqx = -d * 0.03; P.Sqy = d * 0.04;
                P.Legs[0].Fy = -2; P.Legs[1].Fy = -2;
                break;
            }
            case "startle":
            {   // jump-in-place, ears flat, fur puffed
                double cyc = (t % 0.7) / 0.7;
                double j = Math.Sin(cyc * Math.PI);
                P.BodyY = -j * 16;
                P.Sqx = -0.06 + (cyc < 0.2 ? 0.10 : 0);
                P.Sqy = 0.06 + j * 0.05 - (cyc < 0.2 ? 0.10 : 0);
                P.Legs[0].Fy = -6 - j * 10; P.Legs[1].Fy = -6 - j * 10;
                P.Legs[2].Fy = -4 - j * 8; P.Legs[3].Fy = -4 - j * 8;
                P.EarFlat = cyc < 0.55 ? 1 : 0;
                P.HeadY = -2; P.HeadRot = -0.08;
                P.TailMode = "spiral";
                break;
            }
            // ---------------- panda-specific actions ----------------
            case "waddle":
            {   // bear gait: slow, heavy, rolling; head sways with stride
                const double f = 3.8;
                P.Legs[0].Fx = F[0] + W(f, 0) * A * 0.7;   P.Legs[0].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI / 2)) * 4;
                P.Legs[1].Fx = F[1] + W(f, Math.PI) * A * 0.7; P.Legs[1].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 1.5)) * 4;
                P.Legs[2].Fx = F[2] + W(f, Math.PI * 1.15) * A; P.Legs[2].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 1.65)) * 4;
                P.Legs[3].Fx = F[3] + W(f, Math.PI * 0.15) * A; P.Legs[3].Fy = -Math.Max(0, Math.Sin(t * f + Math.PI * 0.65)) * 4;
                P.BobY = -Math.Abs(W(f, 0)) * 4.4;
                P.BodyRot = W(f * 0.5, 0) * 0.085;
                P.Sqx = W(f * 0.5, 1.2) * 0.05; P.Sqy = -P.Sqx;
                P.HeadRot = W(f * 0.5, 0.9) * 0.075;   // head leads the roll
                P.HeadX = W(f * 0.5, 0.9) * 2.2;
                break;
            }
            case "bamboo":
            {
                // research-backed: pandas feed SITTING UP, hooking the stalk
                // toward the mouth with curved paws and gnawing sideways.
                double cyc = t % 1.6;
                P.BodyY = 8; P.BodyRot = 0.05;
                P.Sqx = -0.03; P.Sqy = 0.04;
                P.Legs[2].Fx = F[2] + 7; P.Legs[2].Fy = -2;
                P.Legs[3].Fx = F[3] + 9; P.Legs[3].Fy = -2;
                P.Legs[0].Fx = F[0] - 6; P.Legs[0].Fy = -16;   // both paws hook the stalk
                P.Legs[1].Fx = F[1] - 8; P.Legs[1].Fy = -12;
                if (cyc < 0.95)                    // gnaw-gnaw-gnaw
                {
                    P.HeadY = 2; P.HeadX = 3;
                    P.HeadRot = 0.14 + Math.Sin(t * 9) * 0.05;
                    P.Mouth = "chew"; P.ChewP = Math.Sin(t * 9);
                    P.EyeState = "happy";
                }
                else                               // re-hook the stalk, take a bite
                {
                    P.HeadY = 3; P.HeadX = 2; P.HeadRot = 0.18;
                    P.Mouth = cyc < 1.25 ? "bite" : "closed";
                    P.EyeState = "happy";
                }
                P.Prop = "bamboo";
                P.Particles = ("leaf", 2);
                break;
            }
            case "roll":
            {   // somersault: whole body rotates (pandas really roll — research)
                double cyc = (t % 1.5) / 1.5;
                double q = cyc < 0.15 ? 0 : cyc > 0.85 ? 1 : (cyc - 0.15) / 0.7;
                double e = q * q * (3 - 2 * q); // smoothstep
                P.WholeRot = e * Math.PI * 2;
                P.BodyY = -Math.Sin(e * Math.PI) * 5;
                P.HideLegs = true;
                P.Sqx = -0.06; P.Sqy = 0.08;
                P.EyeState = "happy";
                P.TailMode = "wrap";
                break;
            }
        }
        return P;
    }

    /// <summary>2-bone IK: knee from (hx,hy) toward foot (fx,fy). Port of solveIK.</summary>
    public static (double Kx, double Ky) SolveIk(double hx, double hy, double fx, double fy, double l1, double l2, double bendDir = -1)
    {
        double dx = fx - hx, dy = fy - hy;
        double d = Math.Sqrt(dx * dx + dy * dy);
        double max = (l1 + l2) * 0.999, min = Math.Abs(l1 - l2) * 1.001 + 0.01;
        d = Math.Min(max, Math.Max(min, d));
        double a = Math.Atan2(dy, dx);
        double cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
        double ang = a + bendDir * Math.Acos(Math.Clamp(cosA, -1, 1));
        return (hx + Math.Cos(ang) * l1, hy + Math.Sin(ang) * l1);
    }

    /// <summary>Tail chain points. Port of drawTail's kinematic chain.</summary>
    public static (double X, double Y)[] TailPoints(double bx, double by, string mode, double t, Catalog.BodyDef B)
    {
        // canvas +y is DOWN -> negative sin angle = tail points UP-back
        var CFG = new Dictionary<string, (double A0, double Bend, double WaveF, double WaveA, double Kw)>
        {
            ["sway"] = (-2.45, 0.052, 2.4, 0.10, 2.2),
            ["stream"] = (-2.05, -0.018, 9.0, 0.07, 3.0),
            ["spiral"] = (-2.55, -0.135, 6.2, 0.22, 3.4),
            ["curl"] = (-2.95, 0.105, 1.5, 0.05, 2.0),
            ["wrap"] = (-3.05, 0.055, 0.8, 0.04, 1.6),
        };
        var cfg = CFG.TryGetValue(mode, out var c) ? c : CFG["sway"];
        var pts = new (double, double)[B.TailSegs];
        double x = bx, y = by, ang = cfg.A0;
        for (int i = 0; i < B.TailSegs; i++)
        {
            double k = i / (double)(B.TailSegs - 1);
            double w = Math.Sin(t * cfg.WaveF + k * cfg.Kw) * cfg.WaveA;
            ang += w * 0.55 + cfg.Bend;
            double step = B.TailStep - k * 1.2;
            x += Math.Cos(ang) * step;
            y += Math.Sin(ang) * step;
            pts[i] = (x, y);
        }
        return pts;
    }
}
