// CatBrain.cs — pure state machine + movement brain. Port of cat-brain.js v3.2.
// Open-field roaming is REMOVED (user request): the cat strolls along the
// ground edge-to-edge, jumps onto nearby window tops, strolls there, hops to
// the next window or drops back. Pandas waddle and roll forward as they roll.
// Deterministic when seeded: Tick(dt) is the only mutator.

namespace MeowCat.Core.Brain;

public static class Rng
{
    /// <summary>Deterministic mulberry32 PRNG factory (returns doubles in [0,1)).</summary>
    public static Func<double> Mulberry32(uint seed)
    {
        uint a = seed;
        return () =>
        {
            a = unchecked(a + 0x6D2B79F5u);
            uint t = a;
            t = (uint)((t ^ (t >> 15)) * (1 | t));
            t = (t + (uint)((t ^ (t >> 7)) * (61 | t))) ^ t;
            return ((t ^ (t >> 14)) & 0xFFFFFFFFu) / 4294967296.0;
        };
    }
}

public static class BrainACTIONS
{
    public static readonly string[] All =
    {
        "walk", "idle", "sit", "sleep", "scratch", "dance", "run", "eat",
        "stretch", "groom", "pounce", "knead", "loaf", "yawn", "startle",
        "waddle", "bamboo", "roll",
    };

    // emote shown when entering a state
    public static readonly Dictionary<string, string> EmoteOn = new()
    {
        ["startle"] = "exclaim", ["pounce"] = "exclaim", ["dance"] = "note",
        ["sleep"] = "zzz", ["yawn"] = "zzz", ["groom"] = "heart",
        ["bamboo"] = "heart", ["eat"] = "fish", ["roll"] = "laugh",
        ["stretch"] = "star", ["knead"] = "love",
    };

    public static readonly Dictionary<string, double> CatWeights = new()
    {
        ["walk"] = 20, ["idle"] = 15, ["sit"] = 6, ["run"] = 6, ["scratch"] = 5,
        ["dance"] = 4, ["eat"] = 3, ["sleep"] = 3, ["jump"] = 7,
        ["stretch"] = 5, ["groom"] = 5, ["pounce"] = 5, ["knead"] = 3,
        ["loaf"] = 4, ["yawn"] = 3, ["startle"] = 2,
    };

    public static readonly Dictionary<string, double> PandaWeights = new()
    {
        ["waddle"] = 24, ["idle"] = 13, ["sit"] = 6, ["bamboo"] = 10, ["roll"] = 8,
        ["sleep"] = 4, ["dance"] = 3, ["loaf"] = 5, ["yawn"] = 3,
        ["startle"] = 2, ["happy"] = 4,
    };
}

public sealed class Platform
{
    public double X, Y, W, H;

    public Platform(double x, double y, double w, double h) { X = x; Y = y; W = w; H = h; }
}

public sealed class CatBrain
{
    public double BoundsX, BoundsY, BoundsW, BoundsH;
    public double GroundY;
    public double Speed = 55;          // px/s walk
    public double RunSpeed = 150;      // px/s run
    private readonly Func<double> _rand;
    public Action<string>? OnEvent;
    public string Breed;
    public double MaxX, MinX;

    public double T;                   // animation clock
    public double X;
    public double BaseY;               // feet baseline (ground or window top)
    public double JumpY;
    public int Dir;
    public string State = "idle";
    public double StateT;              // time in current state
    public double StateDur = 1.2;
    public double JumpP;
    public int IdleStreak;
    public bool Sleepy;

    // window-top platforms (title bars of visible windows)
    public List<Platform> Platforms = new();
    public Platform? OnPlatform;
    private (double X0, double X1, double Y0, double Y1, Platform? Pl)? _jump;
    private double _platformCd;        // seconds until next platform scan
    public double PlatformT;           // time spent on current platform

    // contextual emote: { kind, t0 }
    public (string Kind, double T0)? Emote;

    public Dictionary<string, double> Weights;

    public CatBrain(Func<double>? rand = null, string breed = "grey_tabby",
                    double boundsX = 0, double boundsY = 0, double boundsW = 1920, double boundsH = 1080,
                    double groundY = -1, double speed = 55, double x = -1)
    {
        BoundsX = boundsX; BoundsY = boundsY; BoundsW = boundsW; BoundsH = boundsH;
        GroundY = groundY >= 0 ? groundY : boundsY + boundsH - 40;
        Speed = speed;
        _rand = rand ?? Random.Shared.NextDouble;
        Breed = breed;
        MaxX = boundsX + boundsW;
        MinX = boundsX;

        T = 0;
        X = x >= 0 ? x : boundsX + boundsW / 2;
        BaseY = GroundY;
        Dir = _rand() < 0.5 ? -1 : 1;

        Weights = breed == "panda"
            ? new Dictionary<string, double>(BrainACTIONS.PandaWeights)
            : new Dictionary<string, double>(BrainACTIONS.CatWeights);
    }

    private string Pick()
    {
        double total = 0;
        foreach (var kv in Weights) total += kv.Value;
        double r = _rand() * total;
        foreach (var kv in Weights) { r -= kv.Value; if (r <= 0) return kv.Key; }
        return "idle";
    }

    private void Enter(string state, double dur)
    {
        State = state;
        StateT = 0;
        StateDur = dur;
        if (state is "walk" or "run" or "waddle")
        {
            Dir = _rand() < 0.5 ? -1 : 1;
            // bias toward screen center when near edges
            double cx = BoundsX + BoundsW / 2;
            if (Math.Abs(X - cx) > BoundsW * 0.35) Dir = X < cx ? 1 : -1;
        }
        if (state == "jump") JumpP = 0;
        if (state == "sleep") Sleepy = false;
        if (BrainACTIONS.EmoteOn.TryGetValue(state, out var em)) Emote = (em, T);
        OnEvent?.Invoke("enter:" + state);
    }

    private void NextAction()
    {
        if (State == "idle")
        {
            IdleStreak++;
            // long idle -> sleep chance grows
            if (IdleStreak >= 3 && _rand() < 0.35) { Enter("sleep", 8 + _rand() * 8); return; }
        }
        else IdleStreak = 0;

        bool panda = Breed == "panda";
        string act = Pick();
        switch (act)
        {
            case "walk": Enter(panda ? "waddle" : "walk", 2.5 + _rand() * 4); break;
            case "run": Enter("run", 1.4 + _rand() * 1.8); break;
            case "idle": Enter("idle", 1.2 + _rand() * 2.5); break;
            case "sit": Enter("sit", 4 + _rand() * 5); break;
            case "scratch": Enter("scratch", 2.2 + _rand() * 1.5); break;
            case "dance": Enter("dance", 2.6 + _rand() * 2); break;
            case "eat": Enter("eat", 4.9); break;   // 3 bite+chew cycles + gulp
            case "sleep": Enter("sleep", 7 + _rand() * 6); break;
            case "jump": Enter("jump", 0.75); break;
            case "stretch": Enter("stretch", 2.6 + _rand() * 1.2); break;
            case "groom": Enter("groom", 3 + _rand() * 1.5); break;
            case "pounce": Enter("pounce", 1.9); break;
            case "knead": Enter("knead", 3 + _rand() * 2); break;
            case "loaf": Enter("loaf", 4 + _rand() * 4); break;
            case "yawn": Enter("yawn", 2.4); break;
            case "startle": Enter("startle", 0.7); break;
            case "waddle": Enter("waddle", 3 + _rand() * 4); break;
            case "bamboo": Enter("bamboo", 4 + _rand() * 2); break;
            case "roll": Enter("roll", 1.5 * (2 + Math.Floor(_rand() * 2))); break;
            case "happy": Enter("happy", 1.8 + _rand() * 1.2); break;
            default: Enter("idle", 2); break;
        }
    }

    // ------------------------------------------------------------ interactions
    public void Pet()
    {
        Enter("happy", 2.2);
        Emote = ("love", T);
        OnEvent?.Invoke("pet");
    }

    public void Poke() { Enter("startle", 0.7); OnEvent?.Invoke("poke"); }

    public void Feed()
    {
        if (Breed == "panda") Enter("bamboo", 5.5);
        else Enter("eat", 4.9);
        OnEvent?.Invoke("feed");
    }

    public void Dance() { Enter("dance", 4); OnEvent?.Invoke("dance"); }
    public void SleepNow() { Enter("sleep", 10); }

    // ------------------------------------------------------------ platforms
    /// <summary>platforms: full window rects in screen coords; cat stands on TOP border.</summary>
    public void SetPlatforms(IEnumerable<Platform>? list)
    {
        Platforms = (list ?? Enumerable.Empty<Platform>())
            .Where(p => double.IsFinite(p.X) && double.IsFinite(p.Y) &&
                        p.W > 90 && p.H > 40 &&
                        p.Y >= BoundsY - 40 && p.Y <= BoundsY + BoundsH)
            .Take(30)
            .ToList();
        // drop reference to vanished windows
        if (OnPlatform != null && !Platforms.Contains(OnPlatform))
        {
            OnPlatform = null;
            BaseY = GroundY;
        }
    }

    private Platform? FindPlatformAhead(int dirOverride = 0, double reach = 240)
    {
        int dir = dirOverride != 0 ? dirOverride : Dir;
        Platform? best = null; double bestD = double.PositiveInfinity;
        foreach (var pl in Platforms)
        {
            if (ReferenceEquals(pl, OnPlatform)) continue;
            double rise = BaseY - pl.Y;                 // >0 => its top is above our feet
            double minRise = OnPlatform != null ? -70 : 30; // sideways hops allowed between window tops
            if (rise < minRise || rise > 420) continue; // must be within reach
            bool inFront = dir > 0 ? pl.X + pl.W > X - 40 : pl.X < X + 40;
            if (!inFront) continue;
            bool nearEdge = X > pl.X - 100 && X < pl.X + pl.W + 100;
            double ahead = dir > 0 ? pl.X - X : X - (pl.X + pl.W);
            bool approaching = ahead > -80 && ahead < reach;
            if (!nearEdge && !approaching) continue;
            double d = Math.Abs(X - (pl.X + pl.W / 2)) + rise * 0.5;
            if (d < bestD) { bestD = d; best = pl; }
        }
        return best;
    }

    private void JumpTo(Platform pl, double dur, int dirOverride = 0)
    {
        const double pad = 34;
        double x1 = Math.Max(pl.X + pad, Math.Min(pl.X + pl.W - pad, X));
        x1 = Math.Max(MinX + pad, Math.Min(MaxX - pad, x1));
        if (dirOverride != 0) Dir = dirOverride;
        OnPlatform = null;   // airborne — not on any surface mid-jump
        _jump = (X, x1, BaseY, pl.Y, pl);
        Enter("jump", dur);
    }

    private void LeavePlatform(int outwardDir = 0)
    {
        var pl = OnPlatform;
        if (pl == null) return;
        int dir = outwardDir != 0 ? outwardDir : Dir;
        // try a hop to a neighbouring window first (wider reach when leaving an edge)
        if (_rand() < 0.6)
        {
            var next = FindPlatformAhead(dir, 560);
            if (next != null && !ReferenceEquals(next, pl))
            {
                JumpTo(next, 0.55 + Math.Min(0.85, Math.Abs(BaseY - next.Y) / 460), dir);
                return;
            }
        }
        // drop back to the ground with a little forward arc
        OnPlatform = null;
        Dir = dir;
        _jump = (X, X + dir * 46, pl.Y, GroundY, null);
        Enter("jump", 0.5);
    }

    /// <summary>Snap to the best surface under (x, y) — used after a drag.</summary>
    public void DropAt(double x, double y)
    {
        X = x;
        JumpY = 0; JumpP = 0; _jump = null;
        Platform? best = null;
        foreach (var pl in Platforms)
        {
            if (Math.Abs(pl.Y - y) < 28 && x > pl.X - 12 && x < pl.X + pl.W + 12) { best = pl; break; }
        }
        OnPlatform = best;
        BaseY = best?.Y ?? y;
    }

    private void TickPlatformWalk(double dt)
    {
        var pl = OnPlatform!;
        const double pad = 30;
        int outward = 0;
        if (X <= pl.X + pad) { X = pl.X + pad; Dir = 1; outward = -1; }
        else if (X >= pl.X + pl.W - pad) { X = pl.X + pl.W - pad; Dir = -1; outward = 1; }
        PlatformT += dt;
        if (outward != 0 || PlatformT > 7 + _rand() * 7) LeavePlatform(outward);
    }

    // ------------------------------------------------------------ tick
    public void Tick(double dt)
    {
        if (!(dt > 0)) return;
        dt = Math.Min(dt, 0.1); // clamp to survive stalls
        T += dt;
        StateT += dt;

        switch (State)
        {
            case "walk":
            case "waddle":
            {
                if (OnPlatform != null)
                {
                    X += Dir * Speed * dt;
                    TickPlatformWalk(dt);
                    break;
                }
                X += Dir * Speed * dt;        // classic edge-to-edge ground stroll
                ClampAndTurn();
                _platformCd -= dt;
                if (_platformCd <= 0)
                {
                    var pl = FindPlatformAhead();
                    if (pl != null && _rand() < 0.85)
                    {
                        _platformCd = 4;
                        JumpTo(pl, 0.5 + Math.Min(0.85, (BaseY - pl.Y) / 460));
                        break;
                    }
                    _platformCd = 0.9;
                }
                break;
            }
            case "run":
            {
                if (OnPlatform != null)
                {
                    X += Dir * RunSpeed * dt;
                    TickPlatformWalk(dt);
                    break;
                }
                X += Dir * RunSpeed * dt;
                ClampAndTurn(true);
                break;
            }
            case "roll":
            {
                // pandas really roll: forward somersaults with a little travel
                X += Dir * 30 * dt;
                ClampAndTurn();
                break;
            }
            case "jump":
            {
                var J = _jump;
                if (J.HasValue)
                {
                    var (x0, x1, y0, y1, pl) = J.Value;
                    double p = Math.Min(1, StateT / StateDur);
                    double going = y1 - y0;                        // negative = upward
                    double k = going < 0 ? (1 - (1 - p) * (1 - p))   // ease-out ascent
                                        : (p * p);                   // ease-in fall
                    X = x0 + (x1 - x0) * p;
                    JumpY = going * k;
                    JumpP = p;
                }
                else
                {
                    // plain in-place hop
                    double p = StateT / StateDur;
                    JumpP = Math.Min(1, Math.Max(0, p));
                    JumpY = -Math.Sin(Math.Min(1, p) * Math.PI) * 70;
                }
                break;
            }
        }

        if (StateT >= StateDur)
        {
            if (State == "jump" && _jump.HasValue)
            {
                BaseY = _jump.Value.Y1;
                OnPlatform = _jump.Value.Pl;
                _jump = null;
                if (OnPlatform != null) PlatformT = 0;
                JumpY = 0; JumpP = 0;
            }
            NextAction();
        }
    }

    private void ClampAndTurn(bool forceTurn = false)
    {
        const double pad = 60;
        if (X <= MinX + pad) { X = MinX + pad; Dir = 1; if (forceTurn) Enter("walk", 2 + _rand() * 3); }
        else if (X >= MaxX - pad) { X = MaxX - pad; Dir = -1; if (forceTurn) Enter("walk", 2 + _rand() * 3); }
    }

    public (double X, double Y, string State, int Dir, double T, double JumpP) Pose
    {
        get
        {
            double jy = State == "jump" ? JumpY : JumpY;
            return (Math.Round(X), Math.Round(BaseY + JumpY), State, Dir, T, JumpP);
        }
    }
}
