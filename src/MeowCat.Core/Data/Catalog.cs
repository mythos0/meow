// Catalog.cs — breed palettes + body skeletons + store prices.
// Faithful C# port of the Electron v3.2.0 cat-renderer.js PALETTES/BODIES,
// plus one NEW breed "lucky_tabby" (grey tabby with red collar + gold paw tag,
// amber round eyes) that reproduces the user's reference picture exactly.

namespace MeowCat.Core.Data;

public sealed class BreedPalette
{
    public string Name = "";
    public string Body = "normal";
    public string Fur = "#999999";
    public string Dark = "#555555";
    public string Belly = "#eeeeee";
    public string? Stripe;
    public string EarIn = "#d59aa2";
    public string Nose = "#c47583";
    public string Eye = "#79b356";
    public string? Eye2;                 // heterochromia partner iris
    public string Pupil = "#1c1f24";
    public string Tongue = "#d98a94";

    public bool Points;                  // siamese/ragdoll dark mask
    public bool Fluffy;                  // persian/ragdoll/coon cheek fur
    public bool Sheen;                  // bombay sleek highlight
    public string? LimbCol;             // panda black limbs
    public bool EyePatch;               // panda eye patches
    public bool RoundEars;              // panda circle ears
    public bool PandaFace;              // bear muzzle + slant patches
    public bool Band;                   // panda shoulder band
    public bool Spots;                  // bengal rosettes
    public bool Tufts;                  // maine coon / somali lynx tufts
    public bool BrushTail;              // somali
    public bool Socks;                  // white paws
    public bool Blaze;                  // white face wedge
    public bool Beans;                  // pink toe beans
    public bool BigEye;                 // plush round-eye scale up
    public bool Blush;                  // cheek blush
    public bool Hetero;                 // odd eyes
    public bool FoldEars;               // scottish fold
    public (string C, string Dk)[]? Patches;   // calico / mochi body+head patches

    // lucky_tabby extras: collar + tag (reference picture)
    public bool Collar;
    public string CollarCol = "#c23a34";
    public string TagCol = "#e8b23a";
    public bool TagPaw;                  // embossed paw print on the tag
}

public static class Catalog
{
    // ---------------------------------------------------------------- palettes
    public static readonly Dictionary<string, BreedPalette> Palettes = new()
    {
        ["grey_tabby"] = new BreedPalette
        {
            Name = "Grey Tabby",
            Fur = "#9aa0a8", Dark = "#565b63", Belly = "#d7dade", Stripe = "#43474e",
            EarIn = "#d59aa2", Nose = "#c47583", Eye = "#79b356", Pupil = "#1c1f24",
        },
        ["orange_tabby"] = new BreedPalette
        {
            Name = "Orange Tabby",
            Fur = "#eaa75f", Dark = "#c47f3c", Belly = "#f8e3c4", Stripe = "#a85a24",
            EarIn = "#e0a89e", Nose = "#d07f6e", Eye = "#93bb4e", Pupil = "#241a10",
        },
        ["siamese"] = new BreedPalette
        {
            Name = "Siamese",
            Fur = "#ece0cb", Dark = "#6e5138", Belly = "#f4ecdd", Stripe = "#6e5138",
            EarIn = "#caa79b", Nose = "#8a6055", Eye = "#5f9fd8", Pupil = "#1a2230",
            Points = true,
        },
        ["calico"] = new BreedPalette
        {
            Name = "Calico",
            Fur = "#f3e9d7", Dark = "#c9b69a", Belly = "#faf3e6", Stripe = "#b39b78",
            EarIn = "#dba8a0", Nose = "#cf8076", Eye = "#c28a2e", Pupil = "#241a10",
            Patches = new[] { ("#e08a3c", "#b56a24"), ("#453c38", "#2c2622") },
        },
        ["persian"] = new BreedPalette
        {
            Name = "Persian",
            Fur = "#f1e4cf", Dark = "#d3bda0", Belly = "#fbf4e8", Stripe = "#dcc7a8",
            EarIn = "#e0b0aa", Nose = "#d4858d", Eye = "#5f9fd8", Pupil = "#1c2733",
            Fluffy = true,
        },
        ["tuxedo"] = new BreedPalette
        {
            Name = "Tuxedo",
            Fur = "#43434c", Dark = "#26262d", Belly = "#f4f4f4", Stripe = "#1e1e24",
            EarIn = "#c98f96", Nose = "#b56b74", Eye = "#93bb4e", Pupil = "#0e0e12",
            Socks = true,
        },
        // ---------------- v3.1: more designs + body types ----------------
        ["bombay"] = new BreedPalette
        {   // sleek all-black panther-like cat, copper eyes
            Name = "Bombay", Body = "slim",
            Fur = "#3a3a42", Dark = "#202026", Belly = "#5a5a64", Stripe = null,
            EarIn = "#8a5a62", Nose = "#41363b", Eye = "#c9822e", Pupil = "#0a0a0e",
            Sheen = true,
        },
        ["russian_blue"] = new BreedPalette
        {   // plush blue-grey coat, emerald eyes
            Name = "Russian Blue",
            Fur = "#93a7b8", Dark = "#5f7488", Belly = "#d3dee6", Stripe = null,
            EarIn = "#b98f96", Nose = "#7d8894", Eye = "#4fb573", Pupil = "#131c22",
        },
        ["ginger_kitten"] = new BreedPalette
        {   // tiny kitten: big head, short legs, big eyes
            Name = "Ginger Kitten", Body = "kitten",
            Fur = "#f0b268", Dark = "#cf8b42", Belly = "#fae8cd", Stripe = "#b06226",
            EarIn = "#e2a79b", Nose = "#d07f6e", Eye = "#93bb4e", Pupil = "#241a10",
        },
        ["ragdoll"] = new BreedPalette
        {   // big fluffy chubby cat, seal points, blue eyes
            Name = "Ragdoll", Body = "chubby", Fluffy = true,
            Fur = "#efe6da", Dark = "#7a624e", Belly = "#f9f3ea", Stripe = "#7a624e",
            EarIn = "#c9a49b", Nose = "#c08a80", Eye = "#6fa8dc", Pupil = "#1a2230",
            Points = true,
        },
        ["bengal"] = new BreedPalette
        {   // golden coat with dark rosette spots
            Name = "Bengal", Body = "slim",
            Fur = "#dfb570", Dark = "#9c6b2e", Belly = "#f6e8cd", Stripe = null,
            EarIn = "#cf9d8c", Nose = "#b5765e", Eye = "#8fb84e", Pupil = "#20180e",
            Spots = true,
        },
        ["maine_coon"] = new BreedPalette
        {   // extra-large, fluffy, lynx ear tufts
            Name = "Maine Coon", Body = "large", Fluffy = true,
            Fur = "#a8835c", Dark = "#6d4f30", Belly = "#e8d9c2", Stripe = "#5a3f24",
            EarIn = "#b98f96", Nose = "#a06a58", Eye = "#79b356", Pupil = "#1c1710",
            Tufts = true,
        },
        ["panda"] = new BreedPalette
        {   // giant panda: white body, black limbs/ears/eye-patches.
            // Research-backed build (see README "Panda fidelity"):
            // bear body 1.2–1.9 m / 100–115 kg, black ears + eye patches + muzzle +
            // legs + shoulder band, round low ears, 10–15 cm stub tail, short
            // stocky legs, waddling pigeon-toed gait.
            Name = "Panda", Body = "panda",
            Fur = "#f5f3ee", Dark = "#26262b", Belly = "#f5f3ee", Stripe = null,
            EarIn = "#26262b", Nose = "#26262b", Eye = "#8a6a3a", Pupil = "#101014",
            LimbCol = "#26262b", EyePatch = true, RoundEars = true,
            PandaFace = true, Band = true,
        },
        // ---------------- v3.2: completely new designs ----------------
        ["mochi"] = new BreedPalette
        {   // fluffy orange-white chibi, huge slate-blue eyes, white blaze & paws
            Name = "Mochi Kitten", Body = "chibi", Fluffy = true,
            Fur = "#eca963", Dark = "#c98343", Belly = "#fbf3e4", Stripe = "#b06a28",
            EarIn = "#f0b6ad", Nose = "#e2907f", Eye = "#5f7d99", Pupil = "#1c2733",
            Patches = new[] { ("#9b8474", "#6f5d50"), ("#e79a4e", "#bd7430") },
            Socks = true, Blaze = true, Beans = true, BigEye = true,
        },
        ["scottish_fold"] = new BreedPalette
        {   // round plush face, folded-forward ears, copper eyes
            Name = "Scottish Fold", Body = "chubby", FoldEars = true, BigEye = true, Blush = true,
            Fur = "#d9cfc4", Dark = "#a89a8c", Belly = "#f2ede6", Stripe = null,
            EarIn = "#c9a29a", Nose = "#c58a80", Eye = "#d08a3a", Pupil = "#241a10",
        },
        ["snow_angora"] = new BreedPalette
        {   // all-white longhair with odd eyes (blue + green)
            Name = "Snow Angora", Body = "large", Fluffy = true,
            Fur = "#f7f5f0", Dark = "#d9d4cb", Belly = "#ffffff", Stripe = null,
            EarIn = "#f0c9c4", Nose = "#e8a3a8", Eye = "#5f9fd8", Eye2 = "#6cb489",
            Pupil = "#1c2733", Hetero = true, Beans = true,
        },
        ["somali"] = new BreedPalette
        {   // russet fox-like fluff, brush tail, tufted ears
            Name = "Somali", Body = "slim", Fluffy = true, Tufts = true, BrushTail = true,
            Fur = "#cf7f46", Dark = "#9c5526", Belly = "#f4d9b8", Stripe = "#7e3f18",
            EarIn = "#d99a86", Nose = "#a55f48", Eye = "#d9a53a", Pupil = "#20180e",
        },
        ["british_plush"] = new BreedPalette
        {   // dense blue-cream teddy, round everything
            Name = "British Plush", Body = "chubby", BigEye = true,
            Fur = "#b5c4cf", Dark = "#7f93a3", Belly = "#e6edf2", Stripe = null,
            EarIn = "#c9a2a8", Nose = "#8f9aa5", Eye = "#e0902e", Pupil = "#1c1a18",
        },
        ["choco_munchkin"] = new BreedPalette
        {   // chocolate sausage cat with cream socks
            Name = "Choco Munchkin", Body = "munchkin", Socks = true, Blush = true, Beans = true,
            Fur = "#6b4a37", Dark = "#43301f", Belly = "#8a6a52", Stripe = null,
            EarIn = "#c99a90", Nose = "#3d2a1e", Eye = "#e8b34a", Pupil = "#181008",
        },
        ["sakura"] = new BreedPalette
        {   // pale cream-pink chibi with blush cheeks
            Name = "Sakura Kitten", Body = "chibi", BigEye = true, Blush = true, Beans = true, Fluffy = true,
            Fur = "#f4ddc9", Dark = "#dcbb9f", Belly = "#fdf6ee", Stripe = "#e8b8a0",
            EarIn = "#f4b8b0", Nose = "#eb9a96", Eye = "#7fb0d8", Pupil = "#22303e",
        },
        // ---------------- v4.0 (C# edition): the user's reference picture ----------------
        ["lucky_tabby"] = new BreedPalette
        {   // the reference-photo kitten: plush grey-brown tabby, creamy white
            // chest / muzzle / paws, big ROUND amber eyes, and the signature red
            // collar with a gold paw-print tag.
            Name = "Lucky Tabby",
            Fur = "#a29a8e", Dark = "#6b635a", Belly = "#efe9df", Stripe = "#4e463e",
            EarIn = "#e8b0a8", Nose = "#e28a86", Eye = "#d9973c", Pupil = "#241a10",
            Socks = true, BigEye = true,
            Collar = true, CollarCol = "#c23a34", TagCol = "#e8b23a", TagPaw = true,
        },
    };

    // ---------------------------------------------------------------- bodies
    // Cat-local units: feet on y=0, facing +x. All skeleton numbers match
    // cat-renderer.js BODIES so the port draws identical poses.
    public sealed class BodyDef
    {
        public double Rx, Ry;
        public (double X, double Y, double Rx, double Ry) Haunch;
        public (double X, double Y, double Rx, double Ry) Chest;
        public (double X, double Y) Sh, Hp, Head;
        public double HeadR;
        public double LegL1, LegL2, Ear, FootAmp;
        public double[] Feet = System.Array.Empty<double>();   // [fN, fF, bN, bF]
        public (double X, double Y) TailBase;
        public int TailSegs; public double TailStep, TailR;
        public double StandY, Preview;
    }

    public static readonly Dictionary<string, BodyDef> Bodies = new()
    {
        ["normal"] = new BodyDef
        {
            Rx = 41, Ry = 25, Haunch = (-22, -2, 20, 18), Chest = (26, 2, 14, 15),
            Sh = (20, 4), Hp = (-24, 2), Head = (36, -34), HeadR = 23,
            LegL1 = 16, LegL2 = 18, Ear = 1.0, FootAmp = 9,
            Feet = new double[] { 24, 30, -22, -28 },
            TailBase = (-36, -16), TailSegs = 9, TailStep = 8.2, TailR = 7.5,
            StandY = -44, Preview = 0.62,
        },
        ["slim"] = new BodyDef
        {   // oriental/sleek: longer legs, narrower torso
            Rx = 37, Ry = 22.5, Haunch = (-20, -2, 18, 16), Chest = (24, 2, 12, 13),
            Sh = (18, 4), Hp = (-22, 2), Head = (33, -32), HeadR = 21,
            LegL1 = 17, LegL2 = 19, Ear = 1.05, FootAmp = 10,
            Feet = new double[] { 22, 28, -20, -26 },
            TailBase = (-33, -15), TailSegs = 10, TailStep = 8.0, TailR = 6.6,
            StandY = -46, Preview = 0.60,
        },
        ["kitten"] = new BodyDef
        {   // baby proportions: huge head, short legs, stubby tail
            Rx = 31, Ry = 22, Haunch = (-16, -2, 15, 15), Chest = (20, 2, 11, 12),
            Sh = (15, 4), Hp = (-18, 2), Head = (27, -36), HeadR = 26,
            LegL1 = 14, LegL2 = 15, Ear = 1.25, FootAmp = 7,
            Feet = new double[] { 18, 23, -15, -19 },
            TailBase = (-26, -13), TailSegs = 6, TailStep = 6.6, TailR = 5.4,
            StandY = -34, Preview = 0.60,
        },
        ["chubby"] = new BodyDef
        {   // round and heavy: short legs, thick tail
            Rx = 47, Ry = 30, Haunch = (-25, -2, 24, 21), Chest = (29, 2, 17, 18),
            Sh = (22, 5), Hp = (-27, 3), Head = (38, -38), HeadR = 25,
            LegL1 = 13, LegL2 = 14, Ear = 0.95, FootAmp = 8,
            Feet = new double[] { 25, 31, -23, -29 },
            TailBase = (-40, -17), TailSegs = 8, TailStep = 7.8, TailR = 8.4,
            StandY = -40, Preview = 0.55,
        },
        ["large"] = new BodyDef
        {   // maine coon: tall, long, bushy tail
            Rx = 46, Ry = 27, Haunch = (-25, -2, 23, 20), Chest = (29, 2, 16, 17),
            Sh = (22, 4), Hp = (-27, 2), Head = (40, -38), HeadR = 26,
            LegL1 = 19, LegL2 = 21, Ear = 1.1, FootAmp = 10,
            Feet = new double[] { 26, 33, -24, -31 },
            TailBase = (-40, -17), TailSegs = 11, TailStep = 8.8, TailR = 8.4,
            StandY = -50, Preview = 0.55,
        },
        ["panda"] = new BodyDef
        {   // giant panda — bear build (research): barrel body, round head,
            // 10–15cm stub tail, short stocky legs
            Rx = 50, Ry = 33, Haunch = (-26, -2, 27, 24), Chest = (30, 2, 19, 20),
            Sh = (23, 5), Hp = (-28, 3), Head = (37, -42), HeadR = 28,
            LegL1 = 12, LegL2 = 13, Ear = 0.9, FootAmp = 6,
            Feet = new double[] { 26, 32, -24, -30 },
            TailBase = (-44, -16), TailSegs = 4, TailStep = 6.0, TailR = 10.0,
            StandY = -42, Preview = 0.50,
        },
        ["chibi"] = new BodyDef
        {   // plush-toy proportions: enormous head, tiny body
            Rx = 30, Ry = 21, Haunch = (-15, -2, 15, 14), Chest = (19, 2, 11, 12),
            Sh = (14, 4), Hp = (-17, 2), Head = (24, -33), HeadR = 29,
            LegL1 = 12, LegL2 = 13, Ear = 1.3, FootAmp = 6,
            Feet = new double[] { 17, 22, -14, -18 },
            TailBase = (-25, -12), TailSegs = 6, TailStep = 6.2, TailR = 6.2,
            StandY = -31, Preview = 0.58,
        },
        ["munchkin"] = new BodyDef
        {   // sausage body on stubby little legs
            Rx = 42, Ry = 24, Haunch = (-23, -2, 21, 18), Chest = (26, 2, 14, 15),
            Sh = (20, 4), Hp = (-25, 2), Head = (35, -30), HeadR = 23,
            LegL1 = 11, LegL2 = 10, Ear = 1.0, FootAmp = 5,
            Feet = new double[] { 24, 30, -22, -28 },
            TailBase = (-38, -15), TailSegs = 9, TailStep = 7.6, TailR = 7.6,
            StandY = -38, Preview = 0.58,
        },
    };

    // ---------------------------------------------------------------- store
    public static readonly Dictionary<string, int> BreedPrices = new()
    {
        ["grey_tabby"] = 0, ["orange_tabby"] = 100, ["siamese"] = 200, ["calico"] = 300,
        ["persian"] = 400, ["tuxedo"] = 500,
        ["bombay"] = 150, ["russian_blue"] = 250, ["ginger_kitten"] = 300, ["ragdoll"] = 450,
        ["bengal"] = 550, ["maine_coon"] = 650, ["panda"] = 1000,
        ["mochi"] = 350, ["scottish_fold"] = 400, ["snow_angora"] = 500, ["somali"] = 450,
        ["british_plush"] = 380, ["choco_munchkin"] = 420, ["sakura"] = 300,
        ["lucky_tabby"] = 300,
    };

    public static BodyDef BodyOf(BreedPalette pal)
        => Bodies.TryGetValue(pal.Body, out var b) ? b : Bodies["normal"];

    public static BreedPalette PaletteOf(string breed)
        => Palettes.TryGetValue(breed, out var p) ? p : Palettes["grey_tabby"];

    // all states the renderer knows (superset of brain actions)
    public static readonly string[] States =
    {
        "walk", "run", "idle", "sit", "sleep", "dance", "scratch", "jump", "happy", "eat",
        "stretch", "groom", "pounce", "knead", "loaf", "yawn", "startle",
        "waddle", "bamboo", "roll",
    };

    public static readonly string[] EmoteKinds =
    {
        "heart", "love", "note", "question", "exclaim", "sweat",
        "angry", "laugh", "star", "zzz", "fish",
    };

    // bounding box in local units (before dir/scale) — covers the largest body
    // (chubby/panda) + raised paws + emote area. Used for hit tests.
    public const double BboxX = -88, BboxY = -160, BboxW = 180, BboxH = 165;
}
