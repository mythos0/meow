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

    private readonly Random _rng;
    private readonly CatModel _model;
    private readonly CoinWallet? _wallet;

    private double _stateTime;
    private double _stateDuration;
    private double _petCooldownLeft;
    private double _passiveCoinTimer;
    private CatState? _lastAction;

    public CatState State { get; private set; } = CatState.Idle;
    public double StateTime => _stateTime;
    public double StateDuration => _stateDuration;
    public double Happiness { get; private set; } = 65;
    public double Energy { get; private set; } = 80;
    public double Boredom { get; private set; } = 20;
    public CatModel Model => _model;

    /// <summary>Raised after every successful state change (old → new).</summary>
    public event Action<CatState, CatState>? StateChanged;
    /// <summary>Raised when a finite autonomous action ran to completion (before the next pick).</summary>
    public event Action<CatState>? ActionCompleted;

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

        UpdateMoods(dt);
        UpdatePassiveCoins(dt);

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

        var jumpJustEnded = _model.Tick(dt, State);
        if (jumpJustEnded)
        {
            Reward(CoinWallet.ActionReward);
            AddMood(happiness: +3);
            SetState(CatState.Sitting, 1.2);   // proud landing sit
            return;
        }

        _stateTime += dt;
        if (CatStateInfo.IsFinite(State) && State != CatState.Dragged && _stateTime >= _stateDuration)
            CompleteAction();
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

        // Standing on a window top? Hop back down to the floor first.
        if (_model.Y < _currentEnv.FloorY - 2)
        {
            var dir = _rng.Next(2) == 0 ? 1 : -1;
            _model.StartJump(new JumpPlan(_model.X, _model.Y, _model.X + dir * (30 + _rng.NextDouble() * 40),
                _currentEnv.FloorY, 0.7, 50));
            SetStateRaw(CatState.Jumping);
            return;
        }

        var env = _currentEnv;
        var pool = new List<CatState>
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

        var roll = _rng.NextDouble() * total;
        var chosen = CatState.Idle;
        for (var i = 0; i < pool.Count; i++)
        {
            roll -= weights[i];
            if (roll <= 0) { chosen = pool[i]; break; }
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
        if (!CatStateInfo.CanTransition(State, CatState.Petted)) return false;
        SetState(CatState.Petted, 2.5);
        return true;
    }

    public bool RequestFeed()
    {
        if (!CatStateInfo.CanTransition(State, CatState.FeedHappy)) return false;
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
        var endX = Math.Clamp(target.CenterX, _model.MinX + 60, _model.MaxX - 60);
        var endY = target.TopY;
        var dist = Math.Abs(endX - startX) + Math.Abs(endY - startY);
        var dur = Math.Clamp(0.8 + dist / 900.0, 0.9, 1.8);
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
