using System;
using System.Collections.Generic;

namespace MeowCat.Core;

/// <summary>A candidate jump/land target: a real top-level window on screen (DIU rect).</summary>
public sealed record TargetWindow(string Title, double X, double Y, double W, double H)
{
    public double CenterX => X + W / 2;
    public double TopY => Y;
}

/// <summary>Snapshot of the world the brain perceives each tick.</summary>
public sealed class BrainEnvironment
{
    public double ScreenWidth { get; init; } = 1920;
    public double ScreenHeight { get; init; } = 1080;
    public double FloorY { get; init; } = 1040;
    public bool MouseRecentlyMoved { get; init; }
    public double MouseX { get; init; }
    public double MouseY { get; init; }
    public IReadOnlyList<TargetWindow> Windows { get; init; } = Array.Empty<TargetWindow>();

    /// <summary>Desktop icon waypoints (DIU) for strolls across the wallpaper — used when
    /// every other window is minimized/closed. Empty when the shell cannot be read.</summary>
    public IReadOnlyList<(double X, double Y)> DesktopPoints { get; init; } = Array.Empty<(double, double)>();
}

/// <summary>
/// The cat's autonomous brain: mood system (happiness / energy / boredom), weighted action
/// selection, action durations and coin rewards. Owns the <see cref="CatModel"/> for movement.
/// Deterministic given a seed — designed for exhaustive unit testing.
/// </summary>
public sealed class CatBrain
{
    // ---- tuning constants (public for tests/docs) ----
    public const double PetCooldownSeconds = 30;
    public const double SleepEnergyPerSecond = 6.0;
    public const double PassiveEnergyDrain = 0.10;
    public const double ActiveEnergyDrain = 0.28;
    public const double IdleBoredomRate = 0.25;
    public const double WalkBoredomRate = 0.10;
    public const double HappinessDriftTarget = 55.0;

    private const double ChaseEndDistance = 46;

    // ---- platform / auto-jump tuning (public for tests/docs) ----
    public const double PlatformTopTolerance = 10;     // |landY - windowTop| to count as landed
    public const double AutoJumpReachY = 460;          // max height above the floor to hop onto a tab top
    public const double AutoJumpReachX = 560;          // max horizontal distance to a nearby tab top
    public const double AutoJumpCooldown = 6;          // min seconds between spontaneous tab hops
    public const double DesktopStrollWeight = 2.2;     // walking weight bonus while the desktop shows

    // ---- anger tuning (public for tests/docs) ----
    public const double AngryMinSeconds = 55;
    public const double AngryMaxSeconds = 110;
    public const double AttackHappinessGain = 6;       // each screen-scratch soothes the cat a bit
    public const double TreatCalmHappiness = 30;       // giving a treat while angry calms it fast
    public const double CalmHappinessThreshold = 55;   // happiness level that ends the angry mood
    public const double AutoAngerCooldown = 180;       // min seconds between automatic angers
    public static readonly double[] SwipeMoments = { 0.45, 1.05 };   // inside the 1.7s attack

    private readonly Random _rng;
    private readonly CatModel _model;
    private readonly CoinWallet? _wallet;

    private double _stateTime;
    private double _stateDuration;
    private double _petCooldownLeft;
    private double _passiveCoinTimer;
    private CatState? _lastAction;
    private bool _angry;
    private double _angerLeft;
    private double _autoAngryCooldown;
    private int _swipePending;
    private int _swipesDone;

    // platform awareness (tab-top strolling)
    private TargetWindow? _platform;
    private double? _walkTargetX;
    private bool _scratchWhenArrived;
    private double _autoJumpCooldown;

    public CatState State { get; private set; } = CatState.Idle;
    public double StateTime => _stateTime;
    public double StateDuration => _stateDuration;
    public double Happiness { get; private set; } = 65;
    public double Energy { get; private set; } = 80;
    public double Boredom { get; private set; } = 20;
    public CatModel Model => _model;

    /// <summary>ANGRY MODE: the cat is grumpy; clicking it makes it claw the screen.</summary>
    public bool IsAngry => _angry;
    /// <summary>Seconds of grumpiness left before it naturally calms down.</summary>
    public double AngerSecondsLeft => _angerLeft;
    /// <summary>Window whose top edge the cat is standing on (null = desktop floor).</summary>
    public TargetWindow? CurrentPlatform => _platform;

    /// <summary>Raised after every successful state change (old → new).</summary>
    public event Action<CatState, CatState>? StateChanged;
    /// <summary>Raised when a finite autonomous action ran to completion (before the next pick).</summary>
    public event Action<CatState>? ActionCompleted;
    /// <summary>Raised when the cat enters angry mode (host plays growl, shows glass overlay).</summary>
    public event Action? BecameAngry;
    /// <summary>Raised when the cat calms down again — host fades all screen cracks away.</summary>
    public event Action? CalmedDown;

    public CatBrain(CatModel model, CoinWallet? wallet = null, int seed = 202409)
    {
        _model = model ?? throw new ArgumentNullException(nameof(model));
        _wallet = wallet;
        _rng = new Random(seed);
    }

    // ------------------------------------------------------------------ tick

    public void Tick(double dt, BrainEnvironment env)
    {
        dt = Math.Clamp(dt, 0, 0.25); // tolerate debugger pauses / hiccups
        _currentEnv = env;
        _petCooldownLeft = Math.Max(0, _petCooldownLeft - dt);
        _autoJumpCooldown = Math.Max(0, _autoJumpCooldown - dt);

        UpdateBounds(env);

        UpdateAnger(dt);
        UpdateMoods(dt);
        UpdatePassiveCoins(dt);

        // schedule screen-slash moments inside the scratch attack
        if (State == CatState.ScratchAttack)
        {
            var due = 0;
            foreach (var m in SwipeMoments)
                if (_stateTime >= m) due++;
            if (due > _swipesDone)
            {
                _swipePending += due - _swipesDone;
                _swipesDone = due;
            }
        }

        // chasing steers toward the mouse every frame
        if (State == CatState.ChasingCursor)
        {
            var dx = env.MouseX - _model.X;
            _model.Face(Math.Sign(dx) == 0 ? _model.Facing : Math.Sign(dx));
            if (Math.Abs(dx) < ChaseEndDistance || _stateTime >= _stateDuration)
            {
                CompleteAction();
                SetState(CatState.Sitting, 1.5);
                return;
            }
        }

        // TAB-TOP AUTO HOP: strolling along the floor near a window's top border → hop on.
        if (State == CatState.Walking && _platform is null && _walkTargetX is null
            && _autoJumpCooldown <= 0 && !IsAngry && env.Windows.Count > 0)
        {
            var near = NearestReachableWindow(env, aheadOnly: true);
            if (near is not null && _rng.NextDouble() < 0.45 * dt * 60)
            {
                _autoJumpCooldown = AutoJumpCooldown;
                if (StartJumpTo(near)) return;
            }
        }

        // purposeful walking: heading to a desktop icon / window spot → stop on arrival
        if (State == CatState.Walking && _walkTargetX is { } tx)
        {
            var dx = tx - _model.X;
            if (Math.Abs(dx) >= 14)
            {
                _model.Face(Math.Sign(dx));
            }
            else if (_scratchWhenArrived)
            {
                _walkTargetX = null;
                _scratchWhenArrived = false;
                SetState(CatState.Scratching, DurationFor(CatState.Scratching));
                return;
            }
            else
            {
                _walkTargetX = null;
                CompleteAction();
                SetState(CatState.Sitting, 1.0 + _rng.NextDouble());
                return;
            }
        }

        var jumpJustEnded = _model.Tick(dt, State);
        if (jumpJustEnded)
        {
            Reward(CoinWallet.ActionReward);
            AddMood(happiness: +3);
            _platform = FindPlatform(env, _model.X, _model.Y);   // register the landing platform
            SetState(CatState.Sitting, 1.2);   // proud landing sit
            return;
        }

        // keep the platform under the feet fresh (windows move/close, jumps move the cat)
        _platform = FindPlatform(env, _model.X, _model.Y);

        _stateTime += dt;
        if (CatStateInfo.IsFinite(State) && State != CatState.Dragged && _stateTime >= _stateDuration)
            CompleteAction();
    }

    // ------------------------------------------------------ platform & bounds

    /// <summary>
    /// Stands the cat on the right surface: a window top edge is a narrow platform,
    /// the desktop floor spans the whole work area.
    /// </summary>
    private void UpdateBounds(BrainEnvironment env)
    {
        if (_platform is { } p)
            _model.SetBounds(p.X + 24, p.X + p.W - 24);
        else
            _model.SetBounds(0, Math.Max(1200, env.ScreenWidth));
    }

    private static TargetWindow? FindPlatform(BrainEnvironment env, double x, double y)
    {
        TargetWindow? best = null;
        var bestDy = double.MaxValue;
        foreach (var w in env.Windows)
        {
            var dy = Math.Abs(w.TopY - y);
            if (dy > PlatformTopTolerance) continue;
            if (x < w.X - 20 || x > w.X + w.W + 20) continue;
            if (dy < bestDy) { bestDy = dy; best = w; }
        }
        return best;
    }

    /// <summary>The closest window whose top edge the cat could hop onto right now.</summary>
    private TargetWindow? NearestReachableWindow(BrainEnvironment env, bool aheadOnly)
    {
        TargetWindow? best = null;
        var bestDist = double.MaxValue;
        foreach (var w in env.Windows)
        {
            var dy = _model.Y - w.TopY;                       // positive = top edge above the cat
            if (dy < 20 || dy > AutoJumpReachY) continue;     // must be above, within reach
            var dx = w.CenterX - _model.X;
            if (aheadOnly && Math.Sign(dx) != _model.Facing && Math.Abs(dx) > 60) continue;
            if (Math.Abs(dx) > AutoJumpReachX) continue;
            var d = Math.Abs(dx) + dy * 0.6;
            if (d < bestDist) { bestDist = d; best = w; }
        }
        return best;
    }

    private BrainEnvironment _currentEnv = new();

    private void UpdateMoods(double dt)
    {
        Energy = State switch
        {
            CatState.Sleeping => Energy + SleepEnergyPerSecond * dt,
            CatState.Running or CatState.Dancing => Energy - ActiveEnergyDrain * dt,
            _ => Energy - PassiveEnergyDrain * dt
        };
        Energy = Math.Clamp(Energy, 0, 100);

        Boredom += (State switch
        {
            CatState.Idle or CatState.Sitting => IdleBoredomRate,
            CatState.Walking => WalkBoredomRate,
            CatState.Dragged => -IdleBoredomRate,
            _ => 0.0
        }) * dt;
        Boredom = Math.Clamp(Boredom, 0, 100);

        Happiness += (HappinessDriftTarget - Happiness) * 0.002 * dt * 60.0;
        Happiness = Math.Clamp(Happiness, 0, 100);
    }

    // ------------------------------------------------------------------ anger

    private void UpdateAnger(double dt)
    {
        _autoAngryCooldown = Math.Max(0, _autoAngryCooldown - dt);
        if (!_angry) return;

        _angerLeft -= dt;
        if (_angerLeft <= 0)
        {
            Calm();
            return;
        }

        // extremely unhappy + bored cats can rage on their own (rare, throttled)
        if (State != CatState.ScratchAttack && Happiness < 12 && Boredom > 75
            && _autoAngryCooldown <= 0 && _rng.NextDouble() < 0.02 * dt * 60)
        {
            MakeAngry();
        }
    }

    /// <summary>Enters ANGRY MODE (user command or rare auto-rage). Returns true on success.</summary>
    public bool MakeAngry()
    {
        if (_angry) return false;
        if (!CatStateInfo.CanTransition(State, CatState.Angry)) return false;
        _angry = true;
        _angerLeft = AngryMinSeconds + _rng.NextDouble() * (AngryMaxSeconds - AngryMinSeconds);
        BecameAngry?.Invoke();
        SetState(CatState.Angry, 4 + _rng.NextDouble() * 4);
        return true;
    }

    /// <summary>Click while angry: the cat claws the screen → glass cracks (host consumes swipes).</summary>
    public bool ScratchAttackAt()
    {
        if (!_angry) return false;
        if (!CatStateInfo.CanTransition(State, CatState.ScratchAttack)) return false;
        _swipePending = 0;
        _swipesDone = 0;
        SetState(CatState.ScratchAttack, 1.7);
        return true;
    }

    /// <summary>Edge-triggered by the host each frame: true exactly once per claw swipe.</summary>
    public bool ConsumeSwipe()
    {
        if (_swipePending <= 0) return false;
        _swipePending--;
        return true;
    }

    /// <summary>Leaves angry mode immediately (treat given, or anger timer expired).
    /// The host listens to <see cref="CalmedDown"/> to fade the screen cracks away.</summary>
    public void Calm()
    {
        if (!_angry) return;
        _angry = false;
        _angerLeft = 0;
        _swipePending = 0;
        CalmedDown?.Invoke();
        if (State == CatState.Angry || State == CatState.ScratchAttack)
        {
            _lastAction = null;               // allow a clean re-pick from the happy pool
            SetState(CatState.Sitting, 2.0);
        }
    }

    private void UpdatePassiveCoins(double dt)
    {
        if (_wallet is null) return;
        _passiveCoinTimer += dt;
        if (_passiveCoinTimer >= CoinWallet.PassiveIntervalSeconds)
        {
            _passiveCoinTimer -= CoinWallet.PassiveIntervalSeconds;
            Reward(CoinWallet.PassiveAmount);
        }
    }

    private void CompleteAction()
    {
        var finished = State;
        ApplyCompletionEffects(finished);
        ActionCompleted?.Invoke(finished);
        ChooseNext();
    }

    private void ApplyCompletionEffects(CatState s)
    {
        switch (s)
        {
            case CatState.Walking:  AddMood(boredom: -4,  happiness: +1); break;
            case CatState.Running:  AddMood(energy: -3, boredom: -8,  happiness: +2); break;
            case CatState.Dancing:  AddMood(energy: -5, boredom: -18, happiness: +10); Reward(CoinWallet.DanceReward); break;
            case CatState.PlayingYarn: AddMood(energy: -4, boredom: -18, happiness: +10); Reward(CoinWallet.ActionReward); break;
            case CatState.Scratching: AddMood(boredom: -8, happiness: +2); break;
            case CatState.Angry: AddMood(boredom: -2, happiness: +0.5); break;
            case CatState.ScratchAttack:
                AddMood(happiness: AttackHappinessGain, boredom: -3);
                if (Happiness >= CalmHappinessThreshold) Calm();   // exhausted the rage
                break;
            case CatState.Sleeping: AddMood(boredom: -5); break;
            case CatState.ChasingCursor: AddMood(energy: -3, boredom: -12, happiness: +6); break;
            case CatState.Petted:   AddMood(happiness: +8); if (_petCooldownLeft <= 0) { Reward(CoinWallet.PetReward); _petCooldownLeft = PetCooldownSeconds; } break;
            case CatState.FeedHappy: AddMood(energy: +15, happiness: +20); break;
        }
    }

    // ------------------------------------------------------- action selection

    /// <summary>Weight table for the next autonomous action. Public for tests/tuning.</summary>
    public double WeightFor(CatState s, BrainEnvironment env)
    {
        if (s == State && s != CatState.Idle) return 0;                 // never repeat the same activity
        if (s == _lastAction) return s == CatState.Idle ? 1.0 : 0.15;   // discourage immediate repeats

        // ANGRY MODE pool: grumpy pacing, hissy fits and screen-slash mischief.
        if (IsAngry)
        {
            return s switch
            {
                CatState.Angry => 3.0,
                CatState.Walking => 1.2,
                CatState.ScratchAttack => 0.9,
                CatState.Sitting => 0.5,
                _ => 0
            };
        }

        return s switch
        {
            CatState.Idle     => 1.0,
            CatState.Walking  => 3.0 * (1 + Boredom / 100.0),
            CatState.Running  => Energy < 15 ? 0 : 1.2 * (Energy / 100.0),
            CatState.Sitting  => 1.5,
            CatState.Sleeping => Energy < 30 ? 4.0 : Energy < 50 ? 1.5 : 0.4,
            CatState.Dancing  => (Boredom > 60 ? 3.0 : Boredom > 35 ? 1.5 : 0.5) * (Energy > 25 ? 1 : 0.2),
            CatState.PlayingYarn => Boredom > 45 ? 2.5 : 1.2,
            CatState.Scratching  => Boredom > 50 ? 2.0 : 0.8,
            CatState.ChasingCursor => (env.MouseRecentlyMoved && Boredom > 40 ? 2.5 : 0.4) * (Energy > 30 ? 1 : 0.3),
            CatState.Jumping  => env.Windows.Count > 0 && Boredom > 25 ? 1.3 * (Boredom > 40 ? 1.5 : 1.0) : 0,
            _ => 0
        };
    }

    private void ChooseNext()
    {
        if (Energy < 8) { SetState(CatState.Sleeping, 10 + _rng.NextDouble() * 10); return; }

        var env = _currentEnv;
        var onPlatform = _platform is not null || _model.Y < env.FloorY - 2;

        // ---- standing on a tab top: stroll along it, hop to the nearest neighbour, or descend
        if (onPlatform)
        {
            var other = NearestOtherWindow(env);
            var roll = _rng.NextDouble();
            if (other is not null && roll < 0.55)
            {
                StartJumpTo(other);            // continue the window-to-window stroll
                return;
            }
            if (roll < 0.75)
            {
                // walk to a random spot along the current platform
                var p = _platform!;
                var target = Math.Clamp(p.X + 40 + _rng.NextDouble() * Math.Max(1, p.W - 80),
                    _model.MinX, _model.MaxX);
                _walkTargetX = target;
                SetState(CatState.Walking, DurationFor(CatState.Walking));
                return;
            }
            // hop back down to the floor
            var dir = _rng.Next(2) == 0 ? 1 : -1;
            _walkTargetX = null;
            _model.StartJump(new JumpPlan(_model.X, _model.Y, _model.X + dir * (30 + _rng.NextDouble() * 40),
                env.FloorY, 0.7, 50));
            SetStateRaw(CatState.Jumping);
            return;
        }

        // ---- desktop stroll mode: no (visible) windows → wander between folder icons
        if (env.Windows.Count == 0 && env.DesktopPoints.Count > 0 && !IsAngry)
        {
            var roll = _rng.NextDouble();
            if (roll < 0.55)
            {
                // walk to a desktop icon, sit beside it for a moment
                var pt = env.DesktopPoints[_rng.Next(env.DesktopPoints.Count)];
                _walkTargetX = Math.Clamp(pt.X + _rng.NextDouble() * 90 - 45, _model.MinX + 40, _model.MaxX - 40);
                SetState(CatState.Walking, DurationFor(CatState.Walking));
                return;
            }
            if (roll < 0.72)
            {
                // walk to a folder icon first, then scratch right next to it (desktop mischief)
                var pt = env.DesktopPoints[_rng.Next(env.DesktopPoints.Count)];
                _walkTargetX = Math.Clamp(pt.X + (_rng.Next(2) == 0 ? 70 : -70), _model.MinX + 40, _model.MaxX - 40);
                _scratchWhenArrived = true;
                SetState(CatState.Walking, 8);
                return;
            }
        }

        var pool = IsAngry
            ? new List<CatState> { CatState.Angry, CatState.Walking, CatState.ScratchAttack, CatState.Sitting }
            : new List<CatState>
            {
                CatState.Idle, CatState.Walking, CatState.Running, CatState.Sitting, CatState.Sleeping,
                CatState.Dancing, CatState.PlayingYarn, CatState.Scratching, CatState.ChasingCursor, CatState.Jumping
            };

        double total = 0;
        var weights = new double[pool.Count];
        for (var i = 0; i < pool.Count; i++)
        {
            weights[i] = Math.Max(0, WeightFor(pool[i], env));
            if (pool[i] == CatState.Jumping && weights[i] > 0 && env.Windows.Count == 0) weights[i] = 0;
            total += weights[i];
        }
        if (total <= 0) { SetState(CatState.Idle, 2 + _rng.NextDouble() * 3); return; }

        var pick = _rng.NextDouble() * total;
        var chosen = CatState.Idle;
        for (var i = 0; i < pool.Count; i++)
        {
            pick -= weights[i];
            if (pick <= 0) { chosen = pool[i]; break; }
        }

        if (chosen == CatState.Jumping)
        {
            if (env.Windows is { Count: > 0 })
                StartJumpTo(env.Windows[_rng.Next(env.Windows.Count)]);
            else SetState(CatState.Idle, 2);
            return;
        }
        SetState(chosen, DurationFor(chosen));
    }

    /// <summary>Nearest OTHER window top (used for platform → platform hops).</summary>
    private TargetWindow? NearestOtherWindow(BrainEnvironment env)
    {
        TargetWindow? best = null;
        var bestD = double.MaxValue;
        foreach (var w in env.Windows)
        {
            if (_platform is { } p && w.Title == p.Title && Math.Abs(w.X - p.X) < 1 && Math.Abs(w.TopY - p.TopY) < 1)
                continue;
            var dy = Math.Abs(w.TopY - _model.Y);
            var dx = Math.Abs(w.CenterX - _model.X);
            if (dx > AutoJumpReachX * 1.4) continue;
            var d = dx + dy * 0.5;
            if (d < bestD) { bestD = d; best = w; }
        }
        return best;
    }

    private double DurationFor(CatState s) => s switch
    {
        CatState.Idle    => 2 + _rng.NextDouble() * 4,
        CatState.Walking => 3 + _rng.NextDouble() * 5,
        CatState.Running => 2 + _rng.NextDouble() * 3,
        CatState.Sitting => 4 + _rng.NextDouble() * 5,
        CatState.Sleeping => 10 + _rng.NextDouble() * 10,
        CatState.Dancing => 4 + _rng.NextDouble() * 2,
        CatState.PlayingYarn => 6 + _rng.NextDouble() * 3,
        CatState.Scratching => 2.5 + _rng.NextDouble() * 1.5,
        CatState.ChasingCursor => 6,
        CatState.Petted  => 2.5,
        CatState.FeedHappy => 3,
        CatState.Angry => 4 + _rng.NextDouble() * 4,
        CatState.ScratchAttack => 1.7,
        _ => 3
    };

    // ------------------------------------------------------------ public commands

    /// <summary>Force a state from user commands (tray/menu). Returns false if illegal right now.</summary>
    public bool RequestState(CatState s)
    {
        if (!CatStateInfo.CanTransition(State, s)) return false;
        if (s == CatState.ChasingCursor && State == CatState.ChasingCursor) return false;
        SetState(s, DurationFor(s));
        return true;
    }

    public bool TryPet()
    {
        if (_angry) return false;             // an angry cat does NOT want to be petted
        if (!CatStateInfo.CanTransition(State, CatState.Petted)) return false;
        SetState(CatState.Petted, 2.5);
        return true;
    }

    public bool RequestFeed()
    {
        if (!CatStateInfo.CanTransition(State, CatState.FeedHappy)) return false;
        if (_angry)
        {
            // the treat wins the cat over: calm down first, then enjoy the snack
            AddMood(happiness: TreatCalmHappiness);
            Calm();
        }
        SetState(CatState.FeedHappy, 3);
        return true;
    }

    public bool BeginDrag()
    {
        if (!CatStateInfo.CanTransition(State, CatState.Dragged)) return false;
        SetState(CatState.Dragged, double.MaxValue);
        return true;
    }

    public void EndDrag()
    {
        if (State != CatState.Dragged) return;
        SetState(CatState.Sitting, 1.0);
    }

    /// <summary>Starts a ballistic jump onto the given window's top edge.</summary>
    public bool StartJumpTo(TargetWindow target)
    {
        if (target is null || !CatStateInfo.CanTransition(State, CatState.Jumping)) return false;
        var startX = _model.X;
        var startY = _model.Y;
        var endX = Math.Clamp(target.CenterX, startX - 620, startX + 620);
        endX = Math.Clamp(endX, target.X + 40, target.X + target.W - 40);   // land ON the top edge
        var endY = target.TopY;
        var dist = Math.Abs(endX - startX) + Math.Abs(endY - startY);
        var dur = Math.Clamp(0.8 + dist / 900.0, 0.9, 1.8);
        _walkTargetX = null;
        _model.StartJump(new JumpPlan(startX, startY, endX, endY, dur, 90));
        SetStateRaw(CatState.Jumping);
        return true;
    }

    // ---------------------------------------------------------------- plumbing

    /// <summary>Host updates this each frame so the brain knows whether the mouse is being used.</summary>
    public void ReportMouse(bool recentlyMoved) { /* kept for API compat; Tick env is authoritative */ }

    /// <summary>Windows currently available for jumping (refreshed by the host ~1/s).</summary>
    public IReadOnlyList<TargetWindow>? AvailableWindows
    {
        get => _availableWindows;
        set => _availableWindows = value;
    }
    private IReadOnlyList<TargetWindow>? _availableWindows;

    private void Reward(int amount) => _wallet?.Earn(amount, "action");

    private void AddMood(double happiness = 0, double energy = 0, double boredom = 0)
    {
        Happiness = Math.Clamp(Happiness + happiness, 0, 100);
        Energy = Math.Clamp(Energy + energy, 0, 100);
        Boredom = Math.Clamp(Boredom + boredom, 0, 100);
    }

    public void RestoreMood(double happiness, double energy, double boredom)
    {
        Happiness = Math.Clamp(happiness, 0, 100);
        Energy = Math.Clamp(energy, 0, 100);
        Boredom = Math.Clamp(boredom, 0, 100);
    }

    private void SetState(CatState s, double duration)
    {
        if (!CatStateInfo.CanTransition(State, s)) return;
        _stateDuration = duration;
        SetStateRaw(s);
    }

    private void SetStateRaw(CatState s)
    {
        var old = State;
        if (CatStateInfo.IsFinite(old) && old != CatState.Dragged) _lastAction = old;
        State = s;
        _stateTime = 0;
        _model.ClearJumpFinished(); // consumed
        StateChanged?.Invoke(old, s);
    }
}
