// CatArt.cs — procedural cat artwork, port of cat-renderer.js drawCat family.
// Emits into a Core Canvas display list; deterministic in (t, state, breed, dir).
// Coordinate system: feet on y=0, cat centered near x=0, facing +x (flip via dir).
// NEW in v4.0: collar + gold paw tag rendering (lucky_tabby reference picture).

namespace MeowCat.Core.Render;

using MeowCat.Core.Data;

public static class CatArt
{
    private const double TAU = Math.PI * 2;

    private static double Hash(double n)
    {
        double x = Math.Sin(n * 127.1 + 311.7) * 43758.5453;
        return x - Math.Floor(x);
    }

    private static bool Near(string[] arr, string v)
    {
        foreach (var s in arr) if (s == v) return true;
        return false;
    }

    // ---------------------------------------------------------------- main draw
    public static void DrawCat(Canvas ctx, string breed, string state, double t, int dir = 1,
                               double scale = 1, double alpha = 1, double jumpP = 0.5)
    {
        var pal = Catalog.PaletteOf(breed);
        var B = Catalog.BodyOf(pal);
        dir = dir >= 0 ? 1 : -1;

        ctx.Save();
        ctx.Scale(dir * scale, scale);
        ctx.SetAlpha(alpha);

        var P = PoseModel.PoseFor(state, t, jumpP, B, pal);
        double bodyY = B.StandY + P.BodyY + P.BobY;
        double sqx = 1 + P.Sqx, sqy = 1 + P.Sqy;

        // ---------------- ground shadow (soft radial instead of canvas blur)
        ctx.Save();
        ctx.FillEllipse(2, 2, 46 * P.ShadowK, 7 * P.ShadowK, 0,
            ctx.Radial(2, 2, 2, 46 * P.ShadowK,
                new[] { (0.0, "rgba(0,0,0,0.30)"), (0.7, "rgba(0,0,0,0.18)"), (1.0, "rgba(0,0,0,0.02)") }));
        ctx.Restore();

        // whole-body rotation (panda somersault)
        if (Math.Abs(P.WholeRot) > 1e-9)
        {
            ctx.Save();
            ctx.Translate(0, bodyY); ctx.Rotate(P.WholeRot); ctx.Translate(0, -bodyY);
            DrawAll(ctx, P, bodyY, sqx, sqy, pal, B, t, state);
            ctx.Restore();
        }
        else
        {
            DrawAll(ctx, P, bodyY, sqx, sqy, pal, B, t, state);
        }

        ctx.Restore();
    }

    private static void DrawAll(Canvas ctx, Pose P, double bodyY, double sqx, double sqy,
                                BreedPalette pal, Catalog.BodyDef B, double t, string state)
    {
        double shX = B.Sh.X, shY = bodyY - B.Sh.Y;
        double hpX = B.Hp.X, hpY = bodyY - B.Hp.Y;
        double headX = B.Head.X + P.HeadX;
        double headY = bodyY + B.Head.Y + P.HeadY + Math.Sin(t * 2.1) * 1.2;
        double headR = B.HeadR;

        string nearFill = pal.LimbCol ?? pal.Fur;
        string farFill = pal.LimbCol != null ? Canvas.Shade(pal.LimbCol, 0.24) : Canvas.Shade(pal.Dark, 0.18);

        // ---------------- FAR legs
        if (!P.HideLegs)
        {
            DrawLeg(ctx, shX, shY, P.Legs[1], pal, farFill, -1, pal.Dark, B);
            DrawLeg(ctx, hpX, hpY, P.Legs[3], pal, farFill, -1, pal.Dark, B);
        }

        // ---------------- body (tail drawn inside this transform)
        ctx.Save();
        ctx.Translate(0, bodyY);
        ctx.Rotate(P.BodyRot);
        ctx.Scale(sqx, sqy);

        DrawTail(ctx, B.TailBase.X, B.TailBase.Y, P, pal, t, B);

        var bodyGrad = ctx.Radial(-10, -10, 6, B.Rx + 12, new[]
        {
            (0.0, Canvas.Shade(pal.Fur, 0.22)),
            (0.55, pal.Fur),
            (1.0, Canvas.Shade(pal.Fur, -0.28)),
        });
        ctx.FillEllipse(0, -8, B.Rx, B.Ry, 0, bodyGrad);
        // rear haunch volume
        ctx.FillEllipse(B.Haunch.X, B.Haunch.Y, B.Haunch.Rx, B.Haunch.Ry, 0,
            ctx.Radial(B.Haunch.X - 4, B.Haunch.Y - 6, 3, B.Haunch.Rx + 2, new[]
            {
                (0.0, Canvas.Shade(pal.Fur, 0.16)), (1.0, Canvas.Shade(pal.Fur, -0.2)),
            }));
        // chest volume
        ctx.FillEllipse(B.Chest.X, B.Chest.Y, B.Chest.Rx, B.Chest.Ry, 0,
            ctx.Radial(B.Chest.X - 2, B.Chest.Y - 5, 2, B.Chest.Rx + 2, new[]
            {
                (0.0, Canvas.Shade(pal.Fur, 0.10)), (1.0, Canvas.Shade(pal.Fur, -0.18)),
            }));

        // breed marks on body (clipped)
        ctx.Save();
        ctx.ClipEllipse(0, -8, B.Rx, B.Ry, 0);
        if (pal.Patches != null)
        {
            var (a, b) = (pal.Patches[0], pal.Patches[1]);
            (double cx, double cy, double rx2, double ry2, double rot, string col, string dk)[] marks =
            {
                (-14, -20, 16, 11, 0.3, a.C, a.Dk), (12, -22, 13, 9, -0.4, b.C, b.Dk),
                (-30, 2, 11, 9, 0.9, a.C, a.Dk), (30, -6, 10, 12, 0.2, b.C, b.Dk),
            };
            foreach (var m in marks)
            {
                ctx.FillEllipse(m.cx, m.cy, m.rx2, m.ry2, m.rot,
                    ctx.Radial(m.cx - 3, m.cy - 3, 2, Math.Max(m.rx2, m.ry2), new[] { (0.0, m.col), (1.0, m.dk) }));
            }
        }
        if (pal.Spots)
        {
            // bengal rosettes: dark ring, warm center
            (double cx, double cy, double rx2, double ry2, double rot)[] spots =
            {
                (-16, -18, 6.8, 5.2, 0.4), (4, -23, 6.2, 4.8, -0.3), (23, -13, 5.8, 4.6, 0.5),
                (-30, 1, 5.6, 4.4, 0.2), (12, 1, 5.2, 4.2, -0.4), (-4, 5, 4.8, 3.9, 0.3),
                (32, 4, 4.6, 3.8, 0.1),
            };
            foreach (var s in spots)
            {
                ctx.FillEllipse(s.cx, s.cy, s.rx2, s.ry2, s.rot, ctx.Solid(Canvas.Shade(pal.Dark, -0.05)));
                ctx.FillEllipse(s.cx, s.cy, s.rx2 * 0.52, s.ry2 * 0.52, s.rot, ctx.Solid(Canvas.Shade(pal.Fur, 0.10)));
            }
        }
        if (pal.Band)
        {
            // panda shoulder band
            ctx.FillEllipse(22, -3, 19, B.Ry * 0.86, -0.12, ctx.Solid(pal.Dark));
        }
        if (pal.Sheen)
        {
            // bombay sleek highlight along the back
            ctx.FillEllipse(-4, -B.Ry * 0.72, B.Rx * 0.62, B.Ry * 0.30, -0.06,
                ctx.Solid(Canvas.Shade(pal.Fur, 0.30), 0.55));
        }
        if (pal.Stripe != null && !pal.Points)
        {
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.30);
            var stripes = new Geom();
            for (int i = 0; i < 4; i++)
            {
                double sx = -B.Rx * 0.44 + i * B.Rx * 0.30;
                stripes.Move(sx, -B.Ry - 5);
                stripes.Quad(sx + 3, -20, sx - 1, -12);
            }
            ctx.StrokePath(stripes, 5, ctx.Solid(pal.Stripe));
            ctx.SetAlpha(ga);
        }
        if (pal.Socks)
        {
            ctx.FillEllipse(16, 2, B.Rx * 0.58, B.Ry * 0.72, -0.15, ctx.Solid(pal.Belly));
        }
        else
        {
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.55);
            ctx.FillEllipse(10, 8, B.Rx * 0.58, B.Ry * 0.52, -0.1, ctx.Solid(pal.Belly));
            ctx.SetAlpha(ga);
        }
        ctx.Restore(); // clip

        // rim light top
        ctx.StrokePath(Canvas.EllipseArcGeom(0, -8, B.Rx - 2, B.Ry - 1.6, -Math.PI * 0.82, -Math.PI * 0.25),
            3, ctx.Solid("rgba(255,255,255,0.22)"));
        ctx.Restore(); // body

        // ---------------- tucked paws OR near legs
        if (P.HideLegs)
        {
            ctx.FillEllipse(B.Rx * 0.46, bodyY + B.Ry * 0.40, 8, 5.5, 0.25, ctx.Solid(nearFill));
            ctx.FillEllipse(B.Rx * 0.12, bodyY + B.Ry * 0.48, 7.5, 5, 0.35, ctx.Solid(nearFill));
        }
        else
        {
            DrawLeg(ctx, shX, shY, P.Legs[0], pal, nearFill, 1, pal.Dark, B);
            DrawLeg(ctx, hpX, hpY, P.Legs[2], pal, nearFill, 1, pal.Dark, B);
        }

        // ---------------- held / ground props
        if (P.Prop == "bamboo") DrawBamboo(ctx, P, t);
        else if (P.Prop == "fish") DrawFish(ctx, P, t, B);

        // ---------------- head (+ collar & tag)
        DrawHead(ctx, headX, headY, headR, P, pal, t, state, B);

        // collar wraps the neck just under the head
        if (pal.Collar) DrawCollar(ctx, headX, headY, headR, P, pal, t);
    }

    // ---------------------------------------------------------------- legs
    private static void DrawLeg(Canvas ctx, double ax, double ay, FootTarget foot,
                                BreedPalette pal, string fill, int near, string lineCol, Catalog.BodyDef B)
    {
        double l1 = B.LegL1, l2 = B.LegL2;
        var (kx, ky) = PoseModel.SolveIk(ax, ay, foot.Fx, foot.Fy, l1, l2, -1);
        ctx.Capsule(ax, ay, 8.5, kx, ky, 6, ctx.Solid(fill));
        ctx.Capsule(kx, ky, 6, foot.Fx, foot.Fy - 4, 5, ctx.Solid(fill));
        ctx.FillEllipse(foot.Fx + 2, foot.Fy - 4, 6.5, 5, 0, ctx.Solid(fill));
        // toe hint
        double ga = ctx.Alpha;
        ctx.SetAlpha(ga * 0.35);
        var toe = new Geom();
        toe.Move(foot.Fx - 1, foot.Fy - 7);
        toe.Line(foot.Fx + 1, foot.Fy - 3);
        ctx.StrokePath(toe, 1.4, ctx.Solid(Canvas.Shade(lineCol, -0.1)));
        ctx.SetAlpha(ga);
        if (pal.Socks && near > 0)
        {
            ctx.FillEllipse(foot.Fx + 2, foot.Fy - 4.5, 6.8, 5.2, 0, ctx.Solid(pal.Belly));
        }
        if (pal.Beans && near > 0)
        {
            // pink toe beans on the near paws
            (double bx, double by, double br)[] beans =
            {
                (foot.Fx - 2.2, foot.Fy - 6.2, 1.35), (foot.Fx + 1.2, foot.Fy - 6.8, 1.35), (foot.Fx + 4.2, foot.Fy - 5.8, 1.2),
            };
            foreach (var bn in beans)
            {
                ctx.FillEllipse(bn.bx, bn.by, bn.br, bn.br * 0.85, 0, ctx.Solid("#e89aa2"));
            }
            ctx.FillEllipse(foot.Fx + 1, foot.Fy - 2.6, 2.7, 1.8, 0, ctx.Solid("#e89aa2"));
        }
    }

    // ---------------------------------------------------------------- tail
    private static void DrawTail(Canvas ctx, double bx, double by, Pose P, BreedPalette pal, double t, Catalog.BodyDef B)
    {
        string baseCol = pal.Fur, tip = Canvas.Shade(pal.Fur, 0.1);
        if (pal.Points) { baseCol = Canvas.Shade(pal.Dark, 0.22); tip = pal.Dark; }
        if (pal.Patches != null) tip = pal.Patches[0].C;
        if (pal.Socks) tip = pal.Dark;

        int segs = B.TailSegs;
        string mode = P.TailMode.Trim() == "spiral" ? "spiral" : P.TailMode;
        var pts = PoseModel.TailPoints(bx, by, mode, t, B);

        double radBase = pal.BrushTail ? B.TailR * 1.45 : B.TailR;
        double Rad(double k) => radBase - k * (radBase - (pal.BrushTail ? 4.0 : 2.8));

        for (int i = 0; i < segs - 1; i++)
        {
            ctx.Capsule(pts[i].Item1, pts[i].Item2, Rad(i / (double)(segs - 1)),
                        pts[i + 1].Item1, pts[i + 1].Item2, Rad((i + 1) / (double)(segs - 1)), ctx.Solid(baseCol));
        }
        var tp = pts[segs - 1]; var tp1 = pts[segs - 2];
        double kTp = (segs - 1) / (double)(segs - 1), kTp1 = (segs - 2) / (double)(segs - 1);
        ctx.Capsule(tp1.Item1, tp1.Item2, Rad(kTp1), tp.Item1, tp.Item2, Rad(kTp), ctx.Solid(tip));

        if (pal.Stripe != null && !pal.Points && pal.Patches == null)
        {
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.5);
            foreach (var i in new[] { 2, 4, 6 })
            {
                if (i >= segs) continue;
                ctx.FillEllipse(pts[i].Item1, pts[i].Item2, 3.4, 3.0, 0, ctx.Solid(pal.Stripe));
            }
            ctx.SetAlpha(ga);
        }
    }

    // ---------------------------------------------------------------- head
    private static void DrawHead(Canvas ctx, double cx, double cy, double r, Pose P,
                                 BreedPalette pal, double t, string state, Catalog.BodyDef B)
    {
        ctx.Save();
        ctx.Translate(cx, cy);
        ctx.Rotate(P.HeadRot);
        double es = B.Ear; // ear scale

        // ears
        double earTwitch = (Math.Sin(t * 0.9) > 0.97 ? 0.12 : 0) +
                           (state == "dance" ? Math.Sin(t * 12) * 0.05 : 0);
        string earFill = pal.Points ? Canvas.Shade(pal.Dark, 0.1) : pal.Fur;
        foreach (var s in new[] { -1, 1 })
        {
            ctx.Save();
            // bear ears sit low and far to the side; cat ears perch on top
            ctx.Translate(s * r * (pal.PandaFace ? 0.72 : 0.62), -r * (pal.PandaFace ? 0.58 : 0.78));
            ctx.Rotate(s * (0.32 + earTwitch + P.EarFlat * 0.55));
            if (pal.RoundEars)
            {
                double er = (pal.PandaFace ? 7.4 : 8.5) * es;
                ctx.FillEllipse(0, -5 * es, er, er, 0,
                    ctx.Radial(-2, -8, 2, 12 * es, new[] { (0.0, Canvas.Shade(earFill, 0.14)), (1.0, earFill) }));
            }
            else if (pal.FoldEars)
            {
                // scottish fold: small ear folded forward — soft low flap + crease
                var flap = new Geom();
                flap.Move(-6.5 * es, 3 * es);
                flap.Quad(-3.5 * es, -7.5 * es, 2.5 * es, -6 * es);
                flap.Quad(7 * es, -2.5 * es, 6 * es, 4 * es);
                flap.Close();
                ctx.FillPath(flap, ctx.Radial(0, -3 * es, 2, 10 * es,
                    new[] { (0.0, Canvas.Shade(earFill, 0.12)), (1.0, Canvas.Shade(earFill, -0.18)) }));
                var crease = new Geom();
                crease.Move(-3 * es, 1.5 * es);
                crease.Quad(0, -4 * es, 4 * es, -2.5 * es);
                ctx.StrokePath(crease, 1.4, ctx.Solid(Canvas.Shade(earFill, -0.35)));
            }
            else
            {
                var ear = new Geom();
                ear.Move(-7 * es, 4 * es);
                ear.Quad(-2 * es, -16 * es, 3 * es, -14 * es);
                ear.Quad(8 * es, -6 * es, 7 * es, 5 * es);
                ear.Close();
                ctx.FillPath(ear, ctx.Radial(0, -6 * es, 2, 14 * es,
                    new[] { (0.0, Canvas.Shade(earFill, 0.12)), (1.0, Canvas.Shade(earFill, -0.2)) }));
                // inner ear
                var inner = new Geom();
                inner.Move(-3.5 * es, 2 * es);
                inner.Quad(-1 * es, -9 * es, 2 * es, -8 * es);
                inner.Quad(4.5 * es, -3 * es, 4 * es, 3 * es);
                inner.Close();
                double ga = ctx.Alpha;
                ctx.SetAlpha(ga * 0.9);
                ctx.FillPath(inner, ctx.Solid(pal.EarIn));
                ctx.SetAlpha(ga);
                // lynx tufts
                if (pal.Tufts)
                {
                    var tufts = new Geom();
                    (double tx, double ty, double ex, double ey)[] pts =
                    {
                        (-2, -14, -4, -21), (1, -15, 2, -23), (4, -13, 7, -19),
                    };
                    bool first = true;
                    foreach (var p in pts)
                    {
                        if (first) { tufts.Move(p.tx * es, p.ty * es); first = false; }
                        else tufts.Move(p.tx * es, p.ty * es);
                        tufts.Line(p.ex * es, p.ey * es);
                    }
                    ctx.StrokePath(tufts, 1.6, ctx.Solid(Canvas.Shade(pal.Fur, 0.28)));
                }
            }
            ctx.Restore();
        }

        // skull
        ctx.FillEllipse(0, 0, r, r * 0.94, 0,
            ctx.Radial(-r * 0.25, -r * 0.3, r * 0.15, r * 1.35, new[]
            {
                (0.0, Canvas.Shade(pal.Fur, 0.26)),
                (0.55, pal.Fur),
                (1.0, Canvas.Shade(pal.Fur, -0.26)),
            }));

        // breed head marks (clipped to skull)
        ctx.Save();
        ctx.ClipEllipse(0, 0, r, r * 0.94, 0);
        if (pal.Patches != null)
        {
            var (a, b) = (pal.Patches[0], pal.Patches[1]);
            ctx.FillEllipse(-r * 0.45, -r * 0.45, r * 0.42, r * 0.36, 0.5,
                ctx.Radial(-r * 0.5, -r * 0.5, 2, r * 0.5, new[] { (0.0, a.C), (1.0, a.Dk) }));
            ctx.FillEllipse(r * 0.5, -r * 0.55, r * 0.3, r * 0.26, -0.4,
                ctx.Radial(r * 0.5, -r * 0.55, 2, r * 0.36, new[] { (0.0, b.C), (1.0, b.Dk) }));
        }
        if (pal.Points)
        {
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.75);
            ctx.FillEllipse(r * 0.18, r * 0.28, r * 0.52, r * 0.42, 0,
                ctx.Radial(r * 0.1, r * 0.1, 3, r * 0.75, new[]
                {
                    (0.0, Canvas.Shade(pal.Dark, 0.1)), (1.0, Canvas.Shade(pal.Dark, -0.05)),
                }));
            ctx.SetAlpha(ga);
        }
        if (pal.Spots)
        {
            (double dx, double dy, double sr)[] spots = { (-5, -r * 0.55, 2.2), (3, -r * 0.62, 1.8), (-11, -r * 0.4, 1.7) };
            foreach (var sp in spots)
            {
                ctx.FillEllipse(sp.dx, sp.dy, sp.sr, sp.sr * 0.85, 0, ctx.Solid(Canvas.Shade(pal.Dark, -0.02)));
            }
        }
        if (pal.Blaze)
        {
            // white wedge from between the eyes down to the muzzle
            var blaze = new Geom();
            blaze.Move(-2.5, -r * 0.80);
            blaze.Quad(0, -r * 0.34, r * 0.30, r * 0.10);
            blaze.Quad(r * 0.48, r * 0.26, r * 0.40, r * 0.36);
            blaze.Quad(0, r * 0.46, -r * 0.32, r * 0.28);
            blaze.Quad(-r * 0.16, r * 0.02, -2.5, -r * 0.80);
            blaze.Close();
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.92);
            ctx.FillPath(blaze, ctx.Solid(pal.Belly));
            ctx.SetAlpha(ga);
        }
        if (pal.Stripe != null && !pal.Points)
        {
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.4);
            var stripes = new Geom();
            bool first = true;
            foreach (var dx in new[] { -6, 0, 6 })
            {
                if (first) { stripes.Move(dx - 3, -r * 0.86); first = false; }
                else stripes.Move(dx - 3, -r * 0.86);
                stripes.Quad(dx, -r * 0.62, dx + (dx == 0 ? 0 : dx > 0 ? 3 : -3), -r * 0.55);
            }
            ctx.StrokePath(stripes, 2.6, ctx.Solid(pal.Stripe));
            ctx.SetAlpha(ga);
        }
        {
            // muzzle patch (canvas had `pal.socks || true` — always drawn)
            double ga = ctx.Alpha;
            ctx.SetAlpha(ga * 0.85);
            ctx.FillEllipse(r * 0.34, r * 0.30, r * 0.40, r * 0.34, 0, ctx.Solid(pal.Belly));
            ctx.SetAlpha(ga);
        }
        ctx.Restore(); // clip

        // fluffy cheek fur
        if (pal.Fluffy)
        {
            (double ax, double ay)[] cheeks = { (-r * 0.9, r * 0.35), (-r * 0.95, r * 0.1), (-r * 0.8, r * 0.55) };
            foreach (var (ax, ay) in cheeks)
            {
                ctx.FillEllipse(ax, ay, 7, 5, Hash(ax) * 3, ctx.Solid(pal.Fur));
            }
        }

        // eyes
        double blink = P.EyeState == "closed" || P.EyeState == "happy" ? 1 :
            ((Math.Sin(t * 1.9) > 0.985 || Math.Sin(t * 0.53 + 2.2) > 0.994) ? 1 : 0);
        // bear muzzle: dark fur around the nose & mouth
        if (pal.PandaFace)
        {
            ctx.FillEllipse(r * 0.38, r * 0.28, r * 0.30, r * 0.24, 0,
                ctx.Radial(r * 0.30, r * 0.20, 2, r * 0.42, new[]
                {
                    (0.0, Canvas.Shade(pal.Dark, 0.42)), (1.0, Canvas.Shade(pal.Dark, 0.10)),
                }));
        }
        double es2 = pal.BigEye ? 1.34 : pal.PandaFace ? 1.22 : 1;
        foreach (var s in new[] { -1, 1 })
        {
            double ex = s * 8.5 + r * 0.12, ey = -r * 0.12;
            // panda eye patches (behind the eyes)
            if (pal.EyePatch)
            {
                if (pal.PandaFace)
                {
                    ctx.FillEllipse(ex + s * 1.2, ey + 1.8, 8.6, 6.7, s * 0.38, ctx.Solid(pal.Dark));
                    ctx.FillEllipse(ex + s * 4.0, ey + 5.0, 3.6, 4.4, s * 0.62, ctx.Solid(pal.Dark));
                }
                else
                {
                    ctx.FillEllipse(ex, ey, 8.4, 6.6, s * 0.32, ctx.Solid(pal.Dark));
                }
            }
            if (P.EyeState == "closed" || blink == 1)
            {
                var lid = new Geom();
                lid.Move(ex - 4.5 * es2, ey);
                lid.Quad(ex, ey + 2.5 * es2, ex + 4.5 * es2, ey);
                ctx.StrokePath(lid, 2.2 * es2, ctx.Solid(Canvas.Shade(pal.Fur, -0.45)));
                continue;
            }
            if (P.EyeState == "happy")
            {
                var arc = new Geom();
                arc.Move(ex - 4.5 * es2, ey + 1);
                arc.Quad(ex, ey - 4 * es2, ex + 4.5 * es2, ey + 1);
                ctx.StrokePath(arc, 2.4 * es2, ctx.Solid(Canvas.Shade(pal.Fur, -0.45)));
                continue;
            }
            // heterochromia: one blue + one green iris
            string irisBase = pal.Hetero && s == 1 ? (pal.Eye2 ?? pal.Eye) : pal.Eye;
            ctx.FillEllipse(ex, ey, 5.4 * es2, 4.6 * es2, 0, ctx.Solid("#f8f6f2"));
            ctx.FillEllipse(ex + 1.2 * es2, ey, 3.6 * es2, 3.8 * es2, 0,
                ctx.Radial(ex + 0.6 * es2, ey - 0.8, 0.5, 4.2 * es2, new[]
                {
                    (0.0, Canvas.Shade(irisBase, 0.35)), (0.7, irisBase), (1.0, Canvas.Shade(irisBase, -0.4)),
                }));
            ctx.FillEllipse(ex + 1.4 * es2, ey, 1.7 * es2, 3.0 * es2, 0, ctx.Solid(pal.Pupil));
            ctx.FillEllipse(ex + 0.2, ey - 1.4 * es2, 1.1 * es2, 1.0 * es2, 0, ctx.Solid("rgba(255,255,255,0.95)"));
            // second sparkle for the plush big-eye look
            if (pal.BigEye)
            {
                ctx.FillEllipse(ex + 2.4 * es2, ey + 1.8 * es2, 0.8 * es2, 0.7 * es2, 0, ctx.Solid("rgba(255,255,255,0.8)"));
            }
        }

        // blush cheeks
        if (pal.Blush)
        {
            foreach (var s in new[] { -1, 1 })
            {
                ctx.FillEllipse(s * 13.5 + r * 0.10, r * 0.32, 5.2, 3.1, s * 0.2, ctx.Solid("#ee8a94", 0.42));
            }
        }

        // nose
        double nx = r * 0.52, ny = r * 0.22;
        {
            var nose = new Geom();
            nose.Move(nx - 3, ny - 2.2);
            nose.Line(nx + 3, ny - 2.2);
            nose.Quad(nx + 1.5, ny + 2.4, nx, ny + 2.6);
            nose.Quad(nx - 1.5, ny + 2.4, nx - 3, ny - 2.2);
            nose.Close();
            ctx.FillPath(nose, ctx.Solid(pal.Nose));
        }

        // mouth
        string lineCol = Canvas.Shade(pal.Fur, -0.42);
        if (P.Mouth == "yawn")
        {
            ctx.FillEllipse(nx - 1, ny + 9, 5.2, 8.5, 0, ctx.Solid(Canvas.Shade(pal.Tongue, -0.18)));
            ctx.StrokePath(Canvas.EllipseGeom(nx - 1, ny + 9, 5.2, 8.5, 24), 1.6, ctx.Solid(lineCol));
            ctx.FillEllipse(nx - 1, ny + 12.5, 3.4, 4.4, 0, ctx.Solid(pal.Tongue));
        }
        else if (P.Mouth == "open")
        {
            ctx.FillEllipse(nx - 1, ny + 7, 3.4, 4.2, 0, ctx.Solid(pal.Tongue));
            ctx.StrokePath(Canvas.EllipseGeom(nx - 1, ny + 7, 3.4, 4.2, 20), 1.6, ctx.Solid(lineCol));
        }
        else if (P.Mouth == "bite")
        {
            // wide open bite: big dark maw + tongue + tiny teeth
            ctx.FillEllipse(nx - 1, ny + 8, 4.4, 6.4, 0, ctx.Solid("#5c3138"));
            ctx.StrokePath(Canvas.EllipseGeom(nx - 1, ny + 8, 4.4, 6.4, 24), 1.6, ctx.Solid(lineCol));
            ctx.FillEllipse(nx - 1, ny + 11, 3.1, 3.2, 0, ctx.Solid(pal.Tongue));
            var t1 = new Geom();
            t1.Move(nx - 4.2, ny + 3.4); t1.Line(nx - 2.6, ny + 6.2); t1.Line(nx - 1.4, ny + 3.6); t1.Close();
            ctx.FillPath(t1, ctx.Solid("#ffffff", 0.92));
            var t2 = new Geom();
            t2.Move(nx + 2.2, ny + 3.4); t2.Line(nx + 0.8, ny + 6.2); t2.Line(nx - 0.4, ny + 3.6); t2.Close();
            ctx.FillPath(t2, ctx.Solid("#ffffff", 0.92));
        }
        else if (P.Mouth == "chew")
        {
            // side-to-side chew: jaw shifts with the phase, the near cheek bulges
            double cp = P.ChewP;
            ctx.FillEllipse(nx - 2 + cp * 1.6, ny + 6.4, 3.2 + Math.Abs(cp) * 2.2, 2.9 + Math.Abs(cp) * 1.5, 0,
                ctx.Solid(Canvas.Shade(pal.Fur, 0.14)));
            var jaw = new Geom();
            jaw.Move(nx - 3.5 + cp * 2.4, ny + 5.2);
            jaw.Quad(nx - 1 + cp * 2.4, ny + 7.6, nx + 1.5 + cp * 2.4, ny + 5.6);
            ctx.StrokePath(jaw, 1.7, ctx.Solid(lineCol));
        }
        else
        {
            var mouth = new Geom();
            mouth.Move(nx - 1, ny + 2.6);
            mouth.Quad(nx - 3.5, ny + 6.5, nx - 6.5, ny + 4.5);
            mouth.Move(nx - 1, ny + 2.6);
            mouth.Quad(nx + 1, ny + 6.8, nx + 4.5, ny + 4.2);
            ctx.StrokePath(mouth, 1.6, ctx.Solid(lineCol));
        }

        // whiskers
        {
            var wh = new Geom();
            bool first = true;
            for (int i = 0; i < 3; i++)
            {
                double wy = ny + 2 + i * 3.2;
                double wob = Math.Sin(t * 3 + i) * 1.2;
                if (first) { wh.Move(nx + 1, wy); first = false; } else wh.Move(nx + 1, wy);
                wh.Quad(nx + 12, wy - 2 + wob, nx + 22, wy - 5 + wob);
                wh.Move(nx - 5, wy);
                wh.Quad(nx - 14, wy - 1 + wob * 0.6, nx - 21, wy - 3 + wob * 0.6);
            }
            ctx.StrokePath(wh, 1.1, ctx.Solid("#fafafa", 0.85));
        }

        // rim light skull top
        ctx.StrokePath(Canvas.EllipseArcGeom(0, 0, r - 1.4, r * 0.94 - 1.4, -Math.PI * 0.86, -Math.PI * 0.3),
            2.4, ctx.Solid("#ffffff", 0.25));

        ctx.Restore();
    }

    // ---------------------------------------------------------------- collar (v4: reference-picture feature)
    private static void DrawCollar(Canvas ctx, double headX, double headY, double headR,
                                   Pose P, BreedPalette pal, double t)
    {
        // a band around the neck under the skull + a hanging gold tag
        ctx.Save();
        ctx.Translate(headX, headY);
        ctx.Rotate(P.HeadRot);
        // band: short ellipse arc hugging the skull bottom
        ctx.StrokePath(Canvas.EllipseArcGeom(headR * 0.10, headR * 0.52, headR * 0.74, headR * 0.62, Math.PI * 0.18, Math.PI * 0.82, 22),
            4.6, ctx.Solid(pal.CollarCol));
        // tag: gold disc on a short loop, bobbing with the head
        double bob = Math.Sin(t * 2.4) * 0.6;
        double tx = headR * 0.16, ty = headR * 0.98 + 5 + bob;
        ctx.StrokePath(EllipseArc(cx: tx, cy: headR * 0.92, r: 5, 0, Math.PI), 1.4, ctx.Solid(pal.TagCol));
        ctx.FillEllipse(tx, ty, 5.2, 5.2, 0, ctx.Solid(pal.TagCol));
        ctx.StrokePath(Canvas.EllipseGeom(tx, ty, 5.2, 5.2, 20), 1.0, ctx.Solid(Canvas.Shade(pal.TagCol, -0.35)));
        if (pal.TagPaw)
        {
            // embossed paw print: one pad + three toes
            string ink = Canvas.Shade(pal.TagCol, -0.45);
            ctx.FillEllipse(tx, ty + 1.3, 1.9, 1.5, 0, ctx.Solid(ink));
            (double dx, double dy)[] toes = { (-2.0, -1.4), (0, -2.1), (2.0, -1.4) };
            foreach (var (dx, dy) in toes)
            {
                ctx.FillEllipse(tx + dx, ty + dy, 0.85, 0.85, 0, ctx.Solid(ink));
            }
        }
        ctx.Restore();
    }

    private static Geom EllipseArc(double cx, double cy, double r, double a0, double a1)
        => Canvas.EllipseArcGeom(cx, cy, r, r, a0, a1, 12);

    // ---------------------------------------------------------------- particles
    public static void DrawParticles(Canvas ctx, string breed, string state, double t,
                                     double scale = 1, double jumpP = 0.5)
    {
        var pal = Catalog.PaletteOf(breed);
        var B = Catalog.BodyOf(pal);
        var P = PoseModel.PoseFor(state, t, jumpP, B, pal);
        if (P.Particles == null) return;
        var (kind, f) = P.Particles.Value;
        ctx.Save();
        ctx.Scale(scale, scale);
        switch (kind)
        {
            case "sparkle":
                for (int i = 0; i < 5; i++)
                {
                    double ph = (t * f * 0.35 + i * 0.37) % 1;
                    double x = 40 + Math.Sin(i * 2.7) * 42;
                    double y = -95 - ph * 34;
                    double s = (1 - ph) * 5 + 1;
                    ctx.FillPath(StarGeom(x, y, s, s * 0.4, 4), ctx.Solid("#ffec96", 0.9 * (1 - ph)));
                }
                break;
            case "heart":
                for (int i = 0; i < 3; i++)
                {
                    double ph = (t * 0.4 + i * 0.33) % 1;
                    double x = 44 + i * 10;
                    double y = -92 - ph * 40;
                    ctx.FillPath(HeartGeom(x, y, 4 + (1 - ph) * 3), ctx.Solid("#f06e82", 0.85 * (1 - ph)));
                }
                break;
            case "z":
                for (int i = 0; i < 3; i++)
                {
                    double ph = (t * 0.28 + i * 0.4) % 1;
                    double x = 20 + i * 7 + ph * 10;
                    double y = -55 - ph * 36;
                    ctx.Ops.Add(new OpGlyph("z", x, y, 10 + ph * 8, false, ctx.Solid("#bec8dc", 0.8 * (1 - ph)), null, 0));
                }
                break;
            case "chip":
                for (int i = 0; i < 4; i++)
                {
                    double ph = (t * f * 0.3 + i * 0.25) % 1;
                    double x = 52 + ph * 26;
                    double y = -70 + ph * 40;
                    ctx.FillEllipse(x, y, 2.2, 1.6, ph * 6, ctx.Solid("#b4966e", 0.8 * (1 - ph)));
                }
                break;
            case "crumb":
                // fish-bite crumbs popping near the mouth while chewing
                for (int i = 0; i < 3; i++)
                {
                    double ph = (t * 0.9 + i * 0.31) % 1;
                    double x = 34 + i * 5 + Math.Sin(t * 8 + i * 2) * 3;
                    double y = -34 - (1 - ph) * 10 + ph * 14;
                    ctx.FillEllipse(x, y, 1.9, 1.5, ph * 5, ctx.Solid("#94b4cd", 0.85 * (1 - ph)));
                }
                break;
            case "leaf":
                // bamboo leaf bits drifting down while the panda munches
                for (int i = 0; i < 3; i++)
                {
                    double ph = (t * 0.5 + i * 0.33) % 1;
                    double x = 24 + i * 7 + Math.Sin(t * 2 + i) * 4 + ph * 8;
                    double y = -56 + ph * 48;
                    ctx.FillEllipse(x, y, 2.8, 1.5, ph * 5 + i, ctx.Solid("#6ea046", 0.85 * (1 - ph)));
                }
                break;
        }
        ctx.Restore();
    }

    // ---------------------------------------------------------------- bamboo prop
    private static void DrawBamboo(Canvas ctx, Pose P, double t)
    {
        // stalk held between the front paws, leaning toward the face
        double munch = Math.Max(0, Math.Sin(t * 3.4)) * 1.6;
        ctx.Save();
        ctx.Translate(20, 0);
        ctx.Rotate(-0.14);
        ctx.FillRect(-2.6, -62, 5.2, 64, ctx.Linear(0, 0, 0, -62, new[]
        {
            (0.0, "#4c7a2e"), (1.0, "#7ab04a"),
        }));
        // segment joints
        var joints = new Paint { Solid = "#1c3010", Alpha = 0.4 * ctx.Alpha };
        foreach (var yy in new[] { -16, -34, -52 }) ctx.FillRect(-2.6, yy, 5.2, 1.7, joints);
        // leaves at the top
        var leaf = ctx.Solid("#5d9440");
        ctx.FillEllipse(9, -58 - munch * 0.4, 9.5, 3.5, -0.5, leaf);
        ctx.FillEllipse(-7, -54, 8.5, 3.1, 0.6, leaf);
        ctx.FillEllipse(7, -47, 7.5, 2.9, -0.3, leaf);
        ctx.FillEllipse(-4, -62, 7, 2.7, 0.5, ctx.Solid("#6ea44c"));
        ctx.Restore();
    }

    // ---------------------------------------------------------------- fish prop
    private static void DrawFish(Canvas ctx, Pose P, double t, Catalog.BodyDef B)
    {
        // a fish lying on the ground in front of the cat; shrinks as bites are taken
        double fx = B.Feet[0] + 24;
        double remain = 1 - P.FishBite / 3;         // 1 -> 2/3 -> 1/3 -> gone
        if (remain <= 0.01) return;
        double L = 26 * remain + 6;                 // body length shrinks per bite
        double flap = Math.Sin(t * 7) * (0.14 + 0.1 * (1 - remain)); // fresher = livelier
        ctx.Save();
        ctx.Translate(fx, -4);
        ctx.Rotate(flap * 0.4);
        ctx.FillEllipse(0, 0, L * 0.5, 5.2 * remain + 2.2, -0.05,
            ctx.Linear(0, -6, 0, 5, new[] { (0.0, "#9dbdd6"), (1.0, "#6d92ad") }));
        // tail fin (falls off after the first bite — cats eat head-first)
        if (P.FishBite < 1)
        {
            var fin = new Geom();
            fin.Move(-L * 0.5, 0);
            fin.Line(-L * 0.5 - 8 * remain - 3, -5);
            fin.Line(-L * 0.5 - 8 * remain - 3, 5);
            fin.Close();
            ctx.FillPath(fin, ctx.Linear(0, -6, 0, 5, new[] { (0.0, "#9dbdd6"), (1.0, "#6d92ad") }));
        }
        // head end + eye
        ctx.FillEllipse(L * 0.42, -0.6, 2.6 * remain + 1.4, 3.1 * remain + 1.2, 0, ctx.Solid("#5d7f97"));
        ctx.FillEllipse(L * 0.34, -1.6, 1.4, 1.4, 0, ctx.Solid("#1d2830"));
        // dorsal shine
        ctx.StrokePath(Canvas.EllipseArcGeom(0, -1.6, L * 0.36, 2.4, Math.PI * 1.1, Math.PI * 1.9, 14),
            1.3, ctx.Solid("#ffffff", 0.55));
        ctx.Restore();
    }

    // ---------------------------------------------------------------- emotes
    // Anchor where emotes hover: just above the head, centered.
    // v3.2 fixed the "icons show up far above the cat" bug by computing the
    // anchor from the body skeleton so each body type gets a snug anchor.
    public static (double X, double Y) EmoteAnchor(string breed)
    {
        var pal = Catalog.PaletteOf(breed);
        var B = Catalog.BodyOf(pal);
        double headTop = B.StandY + B.Head.Y - B.HeadR;   // highest point of the skull
        return (10, headTop - 16);
    }

    public static void DrawEmote(Canvas ctx, string kind, double t, double x, double y, double scale = 1)
    {
        if (!Near(Catalog.EmoteKinds, kind)) return;
        const double life = 2.0;
        if (t > life) return;
        double pop = Math.Min(1, t * 5.5);
        double spring = 1 + Math.Sin(pop * Math.PI) * 0.28;
        double bob = Math.Sin(t * 3.2) * 2.2;
        double fade = t > life - 0.35 ? Math.Max(0, (life - t) / 0.35) : 1;

        ctx.Save();
        ctx.Scale(scale, scale);
        ctx.Translate(x, y + bob);
        ctx.Scale(spring, spring);
        ctx.SetAlpha(ctx.Alpha * Math.Clamp(fade, 0, 1));

        bool hasBadge = Near(new[] { "question", "exclaim", "note", "angry", "laugh" }, kind);
        if (hasBadge)
        {
            ctx.FillEllipse(0, 0, 15, 15, 0, ctx.Solid("#ffffff", 0.94));
            ctx.StrokePath(Canvas.EllipseGeom(0, 0, 15, 15, 28), 1.6, ctx.Solid("#3c4659", 0.35));
            var tail = new Geom();
            tail.Move(-4, 13); tail.Line(0, 19); tail.Line(4, 13); tail.Close();
            ctx.FillPath(tail, ctx.Solid("#ffffff", 0.94));
        }

        switch (kind)
        {
            case "question":
                ctx.Ops.Add(new OpGlyph("?", 0, 1, 19, true, ctx.Solid("#3a6fd8"), null, 0));
                break;
            case "exclaim":
                ctx.Ops.Add(new OpGlyph("!", 0, 1, 20, true, ctx.Solid("#e0483e"), null, 0));
                break;
            case "note":
            {
                ctx.FillEllipse(-1.5, 6, 4.8, 3.9, -0.25, ctx.Solid("#7a4fd8"));
                ctx.FillRect(2.6, -10, 2.4, 16, ctx.Solid("#7a4fd8"));
                var hook = new Geom();
                hook.Move(4, -10);
                hook.Quad(10, -8, 11, -2);
                ctx.StrokePath(hook, 2.6, ctx.Solid("#7a4fd8"));
                break;
            }
            case "angry":
            {
                // manga anger mark: 4 curved brackets facing the center
                void Poly(double cx, double cy, double a0, double a1)
                {
                    var g2 = new Geom();
                    for (int i = 0; i <= 8; i++)
                    {
                        double a = a0 + (a1 - a0) * i / 8.0;
                        double px = cx + Math.Cos(a) * 5, py = cy + Math.Sin(a) * 5;
                        if (i == 0) g2.Move(px, py); else g2.Line(px, py);
                    }
                    ctx.StrokePath(g2, 3.2, ctx.Solid("#e0483e"));
                }
                Poly(-6.5, -6.5, 0.1, Math.PI * 0.5);
                Poly(6.5, -6.5, Math.PI * 0.5, Math.PI - 0.1);
                Poly(6.5, 6.5, Math.PI + 0.1, Math.PI * 1.5);
                Poly(-6.5, 6.5, Math.PI * 1.5, Math.PI * 2 - 0.1);
                break;
            }
            case "laugh":
            {
                ctx.FillEllipse(0, 0, 11, 11, 0, ctx.Solid("#ffd94d"));
                ctx.StrokePath(Canvas.EllipseGeom(0, 0, 11, 11, 26), 1.4, ctx.Solid("#d9a821"));
                var e1 = new Geom();
                e1.Move(-6.5, -3.5); e1.Quad(-4.5, -6.5, -2.5, -3.5);
                ctx.StrokePath(e1, 1.8, ctx.Solid("#5a4014"));
                var e2 = new Geom();
                e2.Move(2.5, -3.5); e2.Quad(4.5, -6.5, 6.5, -3.5);
                ctx.StrokePath(e2, 1.8, ctx.Solid("#5a4014"));
                ctx.FillEllipse(0, 3.5, 4.5, 3.6, 0, ctx.Solid("#7a3020"));
                ctx.FillEllipse(0, 5.4, 2.6, 1.6, 0, ctx.Solid("#e0705e"));
                break;
            }
            case "heart":
                ctx.FillPath(HeartGeom(0, 0, 9), ctx.Solid("#f06e82"));
                ctx.FillEllipse(-3.2, -3.4, 1.7, 1.2, -0.5, ctx.Solid("#ffffff", 0.85));
                break;
            case "love":
                ctx.FillPath(HeartGeom(0, 0, 10), ctx.Solid("#f0566e"));
                ctx.FillPath(HeartGeom(-12.5, -7.5, 4.6), ctx.Solid("#f89aa8"));
                ctx.FillPath(HeartGeom(12, -5.5, 4.0), ctx.Solid("#f89aa8"));
                break;
            case "star":
                ctx.FillPath(StarGeom(0, 0, 9.5, 4.0, 5), ctx.Solid("#ffcf4d"));
                break;
            case "sweat":
            {
                var drop = new Geom();
                drop.Move(0, -10);
                drop.Cubic(6.5, -1, 5.5, 5.5, 0, 7);
                drop.Cubic(-5.5, 5.5, -6.5, -1, 0, -10);
                drop.Close();
                ctx.FillPath(drop, ctx.Solid("#5aa8e8"));
                ctx.FillEllipse(-1.6, 1.6, 1.3, 2.1, 0.3, ctx.Solid("#ffffff", 0.7));
                break;
            }
            case "zzz":
            {
                (double zx, double zy, double s)[] zs = { (2, -4, 14), (11, 4, 10), (17, 10, 7) };
                foreach (var (zx, zy, s) in zs)
                {
                    ctx.Ops.Add(new OpGlyph("Z", zx, zy, s, true,
                        ctx.Solid("#6a86b8"), ctx.Solid("#ffffff", 0.9), 3));
                }
                break;
            }
            case "fish":
            {
                ctx.FillEllipse(-2.5, 0, 9.5, 5.8, -0.06, ctx.Solid("#7fa8c9"));
                var ft = new Geom();
                ft.Move(6, 0); ft.Line(13, -5.5); ft.Line(13, 5.5); ft.Close();
                ctx.FillPath(ft, ctx.Solid("#7fa8c9"));
                ctx.FillEllipse(-7, -1.2, 1.6, 1.6, 0, ctx.Solid("#22303c"));
                ctx.StrokePath(Canvas.EllipseArcGeom(-3, 0.5, 4, 4, -0.6, 0.6, 10), 1.2, ctx.Solid("#ffffff", 0.5));
                break;
            }
        }
        ctx.Restore();
    }

    // ---------------------------------------------------------------- glyph shapes
    public static Geom StarGeom(double x, double y, double R, double r, int n)
    {
        var g = new Geom();
        for (int i = 0; i < n * 2; i++)
        {
            double rad = i % 2 == 0 ? R : r;
            double a = i * Math.PI / n - Math.PI / 2;
            double px = x + Math.Cos(a) * rad, py = y + Math.Sin(a) * rad;
            if (i == 0) g.Move(px, py); else g.Line(px, py);
        }
        g.Close();
        return g;
    }

    public static Geom HeartGeom(double x, double y, double s)
    {
        var g = new Geom();
        g.Move(x, y + s * 0.9);
        g.Cubic(x - s * 1.4, y - s * 0.2, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
        g.Cubic(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.2, x, y + s * 0.9);
        g.Close();
        return g;
    }
}
