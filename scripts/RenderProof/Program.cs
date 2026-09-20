// Program.cs — offline visual proof generator (Linux-safe).
// Renders the exact Core display lists through SkiaSharp and writes proof
// sheets + runs pixel-sample assertions. Exit code 0 = all assertions pass.

namespace RenderProof;

using SkiaSharp;
using MeowCat.Core.Brain;
using MeowCat.Core.Data;
using MeowCat.Core.Render;

public static class Program
{
    private const double S = 1.35;          // render scale for crisp proof pixels
    private const double CellW = 190;
    private const double CellH = 150;

    public static int Main(string[] args)
    {
        string outDir = args.Length > 0 ? args[0] : "/home/z/my-project/download/proofs";
        Directory.CreateDirectory(outDir);
        int failures = 0;

        failures += SheetAllBreeds(Path.Combine(outDir, "meowcat_v4_breeds.png"));
        failures += SheetMovements(Path.Combine(outDir, "meowcat_v4_movements.png"));
        failures += SheetPanda(Path.Combine(outDir, "meowcat_v4_panda.png"));
        failures += SheetLuckyTabby(Path.Combine(outDir, "meowcat_v4_lucky_tabby.png"));
        failures += SheetEmotes(Path.Combine(outDir, "meowcat_v4_emotes.png"));
        failures += PixelAssertions();

        Console.WriteLine(failures == 0 ? "ALL PROOF ASSERTIONS PASSED" : $"FAILURES: {failures}");
        return failures == 0 ? 0 : 1;
    }

    // ---------------------------------------------------------------- helpers
    private static List<DrawOp> CatOps(string breed, string state, double t, int dir = 1,
                                       double scale = 1, double jumpP = 0.5, bool particles = true)
    {
        var ctx = new Canvas();
        CatArt.DrawCat(ctx, breed, state, t, dir, scale, 1, jumpP);
        if (particles) CatArt.DrawParticles(ctx, breed, state, t, scale, jumpP);
        return ctx.Ops;
    }

    private static SKBitmap MakeSheet(int cols, int rows, double cellW = CellW, double cellH = CellH)
        => new SKBitmap((int)(cols * cellW * S), (int)(rows * cellH * S));

    /// <summary>Draws one pose into a cell; feet at (cell center, bottom-24).</summary>
    private static void DrawCell(SKCanvas cv, int col, int row, List<DrawOp> ops,
                                 string? label = null, double cellW = CellW, double cellH = CellH)
    {
        double x0 = col * cellW, y0 = row * cellH;
        cv.Save();
        cv.Translate((float)(x0 * S), (float)(y0 * S));
        cv.Scale((float)S, (float)S);
        cv.ClipRect(SKRect.Create(0, 0, (float)cellW, (float)cellH));

        using (var cellBg = new SKPaint { Color = new SKColor(28, 30, 38), IsAntialias = true })
            cv.DrawRect(0, 0, (float)cellW, (float)cellH, cellBg);
        using (var floor = new SKPaint { Color = new SKColor(52, 56, 70), IsAntialias = true })
            cv.DrawRect(0, (float)(cellH - 22), (float)cellW, 22, floor);

        cv.Save();
        cv.Translate((float)(cellW / 2), (float)(cellH - 26));
        SkiaReplay.Replay(ops, cv);
        cv.Restore();

        if (label != null)
        {
            using var tp = new SKPaint
            {
                Color = SKColors.White,
                IsAntialias = true,
                TextSize = 11,
                Typeface = SKTypeface.FromFamilyName("DejaVu Sans", SKFontStyle.Bold),
                TextAlign = SKTextAlign.Center,
            };
            cv.DrawText(label, (float)(cellW / 2), (float)(cellH - 6), tp);
        }
        cv.Restore();
    }

    private static void Save(SKBitmap bmp, string path)
    {
        using var data = SKImage.FromBitmap(bmp).Encode(SKEncodedImageFormat.Png, 95);
        using var fs = File.OpenWrite(path);
        data.SaveTo(fs);
        bmp.Dispose();
        Console.WriteLine("wrote " + path);
    }

    // ---------------------------------------------------------------- sheets
    private static int SheetAllBreeds(string path)
    {
        var breeds = Catalog.Palettes.Keys.ToList();
        int cols = 6, rows = (int)Math.Ceiling(breeds.Count / (double)cols);
        var bmp = MakeSheet(cols, rows);
        using var cv = new SKCanvas(bmp);
        for (int i = 0; i < breeds.Count; i++)
        {
            var breed = breeds[i];
            var pal = Catalog.PaletteOf(breed);
            double k = Catalog.BodyOf(pal).Preview;
            DrawCell(cv, i % cols, i / cols, CatOps(breed, "sit", 0.15, scale: k),
                label: pal.Name, cellH: CellH);
        }
        Save(bmp, path);
        return 0;
    }

    private static int SheetMovements(string path)
    {
        // every cat action the brain can pick, 4 frames each — "test all cat movement"
        (string state, double[] times, string label)[] strips =
        {
            ("walk",    new[] { 0.0, 0.12, 0.24, 0.36 }, "walk"),
            ("run",     new[] { 0.0, 0.07, 0.14, 0.21 }, "run"),
            ("idle",    new[] { 0.0, 0.7, 1.4, 2.1 }, "idle"),
            ("sit",     new[] { 0.0, 1.0, 2.0, 3.0 }, "sit"),
            ("sleep",   new[] { 0.5, 1.5, 2.5, 3.5 }, "sleep"),
            ("jump",    new[] { 0.0, 0.3, 0.6, 0.95 }, "jump (p)"),
            ("happy",   new[] { 0.1, 0.35, 0.6, 0.85 }, "happy"),
            ("eat",     new[] { 0.3, 0.5, 0.85, 1.3 }, "eat bite/chew"),
            ("dance",   new[] { 0.1, 0.4, 0.7, 1.0 }, "dance"),
            ("scratch", new[] { 0.0, 0.12, 0.24, 0.36 }, "scratch"),
            ("stretch", new[] { 0.2, 0.8, 1.4, 2.0 }, "stretch"),
            ("groom",   new[] { 0.1, 0.35, 0.6, 0.85 }, "groom"),
            ("pounce",  new[] { 0.3, 0.8, 1.0, 1.3 }, "pounce"),
            ("knead",   new[] { 0.2, 0.6, 1.0, 1.4 }, "knead"),
            ("loaf",    new[] { 0.4, 1.2, 2.0, 2.8 }, "loaf"),
            ("yawn",    new[] { 0.4, 0.9, 1.4, 1.9 }, "yawn"),
            ("startle", new[] { 0.1, 0.25, 0.4, 0.55 }, "startle"),
        };
        int cols = 4, rows = strips.Length;
        var bmp = MakeSheet(cols, rows, cellW: 210, cellH: 140);
        using var cv = new SKCanvas(bmp);
        for (int r = 0; r < strips.Length; r++)
        {
            var (state, times, label) = strips[r];
            for (int c = 0; c < times.Length; c++)
            {
                double jumpP = state == "jump" ? times[c] : 0.5;
                DrawCell(cv, c, r, CatOps("grey_tabby", state, times[c], jumpP: jumpP),
                    label: c == 0 ? label : null, cellW: 210, cellH: 140);
            }
        }
        Save(bmp, path);
        return 0;
    }

    private static int SheetPanda(string path)
    {
        (string state, double[] times, string label)[] strips =
        {
            ("waddle",  new[] { 0.0, 0.2, 0.4, 0.6 }, "waddle"),
            ("bamboo",  new[] { 0.3, 0.8, 1.2, 1.6 }, "bamboo (sit-up feed)"),
            ("roll",    new[] { 0.3, 0.6, 0.9, 1.2 }, "roll"),
            ("sleep",   new[] { 0.5, 1.5, 2.5, 3.5 }, "sprawl nap"),
            ("sit",     new[] { 0.2, 1.2, 2.2, 3.2 }, "sit"),
            ("idle",    new[] { 0.0, 0.7, 1.4, 2.1 }, "idle"),
            ("happy",   new[] { 0.1, 0.35, 0.6, 0.85 }, "happy"),
            ("yawn",    new[] { 0.4, 0.9, 1.4, 1.9 }, "yawn"),
            ("dance",   new[] { 0.1, 0.4, 0.7, 1.0 }, "dance"),
            ("loaf",    new[] { 0.4, 1.2, 2.0, 2.8 }, "loaf"),
        };
        int cols = 4, rows = strips.Length;
        var bmp = MakeSheet(cols, rows, cellW: 210, cellH: 145);
        using var cv = new SKCanvas(bmp);
        for (int r = 0; r < strips.Length; r++)
        {
            var (state, times, label) = strips[r];
            for (int c = 0; c < times.Length; c++)
            {
                var ops = CatOps("panda", state, times[c]);
                // bamboo/roll also need the prop — DrawCat renders props internally
                DrawCell(cv, c, r, ops, label: c == 0 ? label : null, cellW: 210, cellH: 145);
            }
        }
        Save(bmp, path);
        return 0;
    }

    private static int SheetLuckyTabby(string path)
    {
        int cols = 4, rows = 4;
        var bmp = MakeSheet(cols, rows, cellW: 220, cellH: 150);
        using var cv = new SKCanvas(bmp);
        var frames = new (string state, double t)[]
        {
            ("sit", 0.15), ("walk", 0.0), ("walk", 0.18), ("walk", 0.36),
            ("run", 0.05), ("jump", 0.0), ("jump", 0.5), ("eat", 0.4),
            ("sleep", 1.0), ("dance", 0.4), ("happy", 0.3), ("stretch", 0.5),
            ("groom", 0.4), ("pounce", 0.6), ("loaf", 1.0), ("yawn", 1.0),
        };
        for (int i = 0; i < frames.Length; i++)
        {
            var (state, t) = frames[i];
            double jumpP = state == "jump" ? t : 0.5;
            DrawCell(cv, i % cols, i / cols, CatOps("lucky_tabby", state, t, jumpP: jumpP),
                label: $"{state} {t:0.00}", cellW: 220, cellH: 150);
        }
        Save(bmp, path);
        return 0;
    }

    private static int SheetEmotes(string path)
    {
        var bmp = MakeSheet(Catalog.EmoteKinds.Length, 1, cellW: 90, cellH: 110);
        using var cv = new SKCanvas(bmp);
        for (int i = 0; i < Catalog.EmoteKinds.Length; i++)
        {
            var kind = Catalog.EmoteKinds[i];
            var ctx = new Canvas();
            // (0,-25) = floating just above the feet origin, like over a head
            CatArt.DrawEmote(ctx, kind, 0.5, 0, -25);
            DrawCell(cv, i, 0, ctx.Ops, label: kind, cellW: 90, cellH: 110);
        }
        Save(bmp, path);
        return 0;
    }

    // ---------------------------------------------------------------- assertions
    private static int PixelAssertions()
    {
        int failures = 0;
        void Check(bool cond, string what)
        {
            if (cond) { Console.WriteLine("PASS  " + what); }
            else { Console.WriteLine("FAIL  " + what); failures++; }
        }

        SKBitmap Render(string breed, string state, double t, double scale = 1.0, double jumpP = 0.5)
        {
            const int W = 300, H = 300;
            var bmp = new SKBitmap(W, H);
            using var cv = new SKCanvas(bmp);
            cv.Clear(SKColors.Transparent);
            cv.Translate(W / 2f, H - 30f);
            cv.Scale((float)scale, (float)scale);
            SkiaReplay.Replay(CatOps(breed, state, t, jumpP: jumpP), cv);
            return bmp;
        }

        // 1) the cat actually renders (opaque pixels in the body region)
        using (var bmp = Render("grey_tabby", "sit", 0.15))
        {
            int cx = 150, cy = 300 - 30 - 60;   // mid-body above feet
            var px = bmp.GetPixel(cx, cy);
            Check(px.Alpha > 200, $"sit body renders at centre (alpha={px.Alpha})");
            bool anyInk = false;
            for (int y = 20; y < 280 && !anyInk; y += 4)
                for (int x = 20; x < 280 && !anyInk; x += 4)
                    if (bmp.GetPixel(x, y).Alpha > 100) anyInk = true;
            Check(anyInk, "sit has visible ink");
        }

        // 2) fur colour sample near body centre ≈ palette fur (within gradient range)
        using (var bmp = Render("orange_tabby", "sit", 0.15))
        {
            var px = bmp.GetPixel(150, 300 - 30 - 55);
            Check(px.Red > 120 && px.Red > px.Blue + 40, $"orange_tabby fur is warm ({px.Red},{px.Green},{px.Blue})");
        }

        // 3) panda: black limbs + white torso
        using (var bmp = Render("panda", "sit", 0.2))
        {
            bool foundDark = false, foundLight = false;
            for (int x = 60; x < 240; x += 3)
                for (int y = 60; y < 280; y += 3)
                {
                    var p = bmp.GetPixel(x, y);
                    if (p.Alpha > 200)
                    {
                        int lum = (p.Red + p.Green + p.Blue) / 3;
                        if (lum < 70) foundDark = true;
                        if (lum > 190) foundLight = true;
                    }
                }
            Check(foundDark, "panda has black limbs/patches");
            Check(foundLight, "panda has white torso");
        }

        // 4) lucky_tabby: red collar pixels exist
        using (var bmp = Render("lucky_tabby", "sit", 0.15))
        {
            bool foundRed = false;
            for (int x = 60; x < 240; x += 2)
                for (int y = 40; y < 280; y += 2)
                {
                    var p = bmp.GetPixel(x, y);
                    if (p.Alpha > 200 && p.Red > 140 && p.Green < 100 && p.Blue < 100) foundRed = true;
                }
            Check(foundRed, "lucky_tabby shows the red collar");
        }

        // 5) tuxedo: white belly + dark back
        using (var bmp = Render("tuxedo", "sit", 0.15))
        {
            bool foundWhite = false, foundDark = false;
            for (int x = 60; x < 240; x += 3)
                for (int y = 60; y < 280; y += 3)
                {
                    var p = bmp.GetPixel(x, y);
                    if (p.Alpha > 200)
                    {
                        int lum = (p.Red + p.Green + p.Blue) / 3;
                        if (lum > 210) foundWhite = true;
                        if (lum < 80) foundDark = true;
                    }
                }
            Check(foundWhite && foundDark, "tuxedo is black-and-white");
        }

        // 6) walking frames differ (movement is alive)
        using (var a = Render("grey_tabby", "walk", 0.0))
        using (var b = Render("grey_tabby", "walk", 0.18))
        {
            int diffs = 0;
            for (int y = 0; y < 300; y += 3)
                for (int x = 0; x < 300; x += 3)
                    if (a.GetPixel(x, y) != b.GetPixel(x, y)) diffs++;
            Check(diffs > 40, $"walk frames animate ({diffs} sampled px differ)");
        }

        // 7) eat shows the fish prop (steel-blue pixels in front of the paws)
        using (var bmp = Render("grey_tabby", "eat", 0.2))
        {
            bool foundFish = false;
            for (int x = 150; x < 295; x += 2)
                for (int y = 180; y < 285; y += 2)
                {
                    var p = bmp.GetPixel(x, y);
                    if (p.Alpha > 150 && p.Blue > p.Red + 20 && p.Blue > 100) foundFish = true;
                }
            Check(foundFish, "eat renders the fish prop");
        }

        // 8) bamboo prop for the panda
        using (var bmp = Render("panda", "bamboo", 0.4))
        {
            bool foundGreen = false;
            for (int x = 100; x < 295; x += 2)
                for (int y = 40; y < 285; y += 2)
                {
                    var p = bmp.GetPixel(x, y);
                    if (p.Alpha > 150 && p.Green > p.Red + 20 && p.Green > 90) foundGreen = true;
                }
            Check(foundGreen, "bamboo renders green stalk/leaves");
        }

        return failures;
    }
}
