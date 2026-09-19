using System;
using System.Collections.Generic;
using System.Linq;
using MeowCat.Core;
using Xunit;

namespace MeowCat.Tests;

public class CatBrainTests
{
    private static (CatBrain Brain, CatModel Model, CoinWallet Wallet) Make(int seed = 7)
    {
        var model = new CatModel { MaxX = 1200, X = 600, Y = 1040 };   // standing on the floor
        var wallet = new CoinWallet();
        var brain = new CatBrain(model, wallet, seed);
        return (brain, model, wallet);
    }

    private static BrainEnvironment Env(double floorY = 1040, bool mouseMoved = false, double mouseX = 600,
        IReadOnlyList<TargetWindow>? windows = null) => new()
    {
        ScreenWidth = 1920, ScreenHeight = 1080, FloorY = floorY,
        MouseRecentlyMoved = mouseMoved, MouseX = mouseX,
        Windows = windows ?? Array.Empty<TargetWindow>(),
    };

    [Fact]
    public void Brain_StartsIdle()
    {
        var (brain, _, _) = Make();
        Assert.Equal(CatState.Idle, brain.State);
    }

    [Fact]
    public void Mood_AlwaysClamped()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(-5, 150, 999);
        Assert.Equal(0, brain.Happiness);
        Assert.Equal(100, brain.Energy);
        Assert.Equal(100, brain.Boredom);
    }

    [Fact]
    public void Sleeping_RestoresEnergy_OverTime()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(50, 20, 0);
        Assert.True(brain.RequestState(CatState.Sleeping));
        for (var i = 0; i < 300; i++) brain.Tick(0.1, Env());   // 30 s asleep
        Assert.True(brain.Energy > 90, $"energy was {brain.Energy}");
    }

    [Fact]
    public void Passive_DrainsEnergy_WhenAwake()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(50, 80, 0);
        Assert.True(brain.RequestState(CatState.Sitting));
        for (var i = 0; i < 20; i++) brain.Tick(0.1, Env());   // 2 s — sit (min 4 s) cannot complete
        Assert.True(brain.Energy < 80, $"energy was {brain.Energy}");
    }

    [Fact]
    public void FiniteActions_Complete_AndTransition()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(60, 90, 10);
        Assert.True(brain.RequestState(CatState.Dancing));
        var changed = false;
        brain.StateChanged += (_, _) => changed = true;
        var elapsed = 0.0;
        while (brain.State == CatState.Dancing && elapsed < 30)
        {
            brain.Tick(0.1, Env());
            elapsed += 0.1;
        }
        Assert.True(changed);
        Assert.NotEqual(CatState.Dancing, brain.State);
        Assert.True(elapsed >= 3.5, $"dancing ended too early: {elapsed}");
        Assert.True(elapsed <= 7.0, $"dancing never ended cleanly: {elapsed}");
    }

    [Fact]
    public void Dance_Completion_RaisesBoredomRelief_AndCoins()
    {
        var (brain, model, wallet) = Make();
        brain.RestoreMood(30, 90, 70);
        var before = wallet.Balance;
        Assert.True(brain.RequestState(CatState.Dancing));
        var elapsed = 0.0;
        while (brain.State == CatState.Dancing && elapsed < 30) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.True(brain.Boredom < 62, $"boredom after dance: {brain.Boredom}");
        Assert.True(brain.Happiness > 35);
        Assert.True(wallet.Balance >= before + CoinWallet.DanceReward - 1,
            $"balance {wallet.Balance} vs {before}");
    }

    [Fact]
    public void LowEnergy_ForcesSleep()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(60, 5, 0);
        Assert.True(brain.RequestState(CatState.Sitting));
        brain.Tick(0.1, Env());           // sitting completes? no — but tick once, then end action
        // run until the brain finishes the sit and picks next action
        var elapsed = 0.0;
        while (brain.State == CatState.Sitting && elapsed < 30) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.Equal(CatState.Sleeping, brain.State);
    }

    [Fact]
    public void TryPet_GrantsCoinOnlyAfterCooldown()
    {
        var (brain, _, wallet) = Make();
        var before = wallet.Balance;

        Assert.True(brain.TryPet());
        var elapsed = 0.0;
        while (brain.State == CatState.Petted && elapsed < 10) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.Equal(before + CoinWallet.PetReward, wallet.Balance);

        // pet again immediately: no second reward inside cooldown
        Assert.True(brain.TryPet());
        elapsed = 0.0;
        while (brain.State == CatState.Petted && elapsed < 10) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.Equal(before + CoinWallet.PetReward, wallet.Balance);
    }

    [Fact]
    public void Jump_ReachesTarget_AndLandsSitting()
    {
        var (brain, model, _) = Make();
        model.X = 200; model.Y = 1040;
        var target = new TargetWindow("Notepad", 800, 500, 400, 300);
        Assert.True(brain.StartJumpTo(target));
        Assert.Equal(CatState.Jumping, brain.State);

        var elapsed = 0.0;
        while (brain.State == CatState.Jumping && elapsed < 10) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.Equal(CatState.Sitting, brain.State);
        Assert.Equal(target.CenterX, model.X, 1);
        Assert.Equal(target.TopY, model.Y, 1);
    }

    [Fact]
    public void Jump_ApexIsAboveBothEndpoints()
    {
        var plan = new JumpPlan(200, 1040, 800, 500, 1.2, 200);
        Assert.True(plan.ApexY < Math.Min(1040, 500) - 20, $"apex {plan.ApexY}");
        Assert.Equal(200, plan.At(0).X, 3);
        Assert.Equal(800, plan.At(1).X, 3);
        Assert.True(plan.VelocityY(0.1) < 0, "should be rising early");
        Assert.True(plan.VelocityY(0.9) > 0, "should be falling late");
    }

    [Fact]
    public void StandingOnWindow_HopsBackToFloor()
    {
        var (brain, model, _) = Make();
        model.X = 500; model.Y = 600;   // up on a "window"
        Assert.True(brain.RequestState(CatState.Sitting));
        var elapsed = 0.0;
        while (brain.State == CatState.Sitting && elapsed < 30) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        // next action must bring the cat back down to the floor
        var guard = 0;
        while (model.Y < Env().FloorY - 2 && guard++ < 200) { brain.Tick(0.1, Env()); }
        Assert.True(model.Y >= 1040 - 2, $"cat stuck at y={model.Y}");
    }

    [Fact]
    public void Chase_EndsNearMouse()
    {
        var (brain, model, _) = Make();
        model.X = 300; model.Y = 1040;
        Assert.True(brain.RequestState(CatState.ChasingCursor));
        var env = Env(mouseX: 340, mouseMoved: true);
        var elapsed = 0.0;
        while (brain.State == CatState.ChasingCursor && elapsed < 10) { brain.Tick(0.1, env); elapsed += 0.1; }
        Assert.NotEqual(CatState.ChasingCursor, brain.State);
        Assert.True(Math.Abs(model.X - 340) < 60, $"ended at {model.X}");
    }

    [Fact]
    public void Commands_RespectTransitionRules()
    {
        var (brain, _, _) = Make();
        Assert.True(brain.StartJumpTo(new TargetWindow("w", 500, 400, 300, 200)));
        Assert.False(brain.RequestState(CatState.Dancing), "cannot dance mid-air");
        Assert.False(brain.TryPet(), "cannot pet mid-air");
        brain.Tick(0.1, Env());
        // finish the jump
        var elapsed = 0.0;
        while (brain.State == CatState.Jumping && elapsed < 10) { brain.Tick(0.1, Env()); elapsed += 0.1; }
        Assert.True(brain.RequestState(CatState.Dancing));
    }

    [Fact]
    public void Drag_OverridesEverything_AndBlocksCommands()
    {
        var (brain, _, _) = Make();
        Assert.True(brain.BeginDrag());
        Assert.False(brain.RequestState(CatState.Dancing));
        Assert.False(brain.TryPet());
        brain.EndDrag();
        Assert.Equal(CatState.Sitting, brain.State);
        Assert.True(brain.RequestState(CatState.Dancing));
    }

    [Fact]
    public void Simulation_10kTicks_InvariantsHold()
    {
        var (brain, model, wallet) = Make();
        brain.RestoreMood(65, 80, 20);
        var rnd = new Random(1234);
        var states = new HashSet<CatState>();
        var minEnergy = 200.0;
        var coinsBefore = wallet.Balance;

        for (var i = 0; i < 10_000; i++)
        {
            var windows = rnd.Next(6) == 0
                ? new List<TargetWindow> { new("App", 100 + rnd.Next(800), 200 + rnd.Next(400), 400, 300) }
                : (IReadOnlyList<TargetWindow>)Array.Empty<TargetWindow>();
            brain.Tick(0.05, Env(mouseMoved: rnd.Next(4) == 0, mouseX: rnd.Next(1900), windows: windows));
            states.Add(brain.State);
            minEnergy = Math.Min(minEnergy, brain.Energy);

            Assert.InRange(brain.Happiness, 0, 100);
            Assert.InRange(brain.Energy, 0, 100);
            Assert.InRange(brain.Boredom, 0, 100);
            Assert.InRange(model.X, 0, 1200);
            Assert.True(wallet.Balance >= coinsBefore, "coins must never decrease without purchases");
            Assert.True(model.Y <= 1040 + 0.001, $"cat below the floor: {model.Y}");
            Assert.True(model.Y >= 100, $"cat launched into space: {model.Y}");
        }
        // across a long life the cat should have done several different things
        Assert.True(states.Count >= 4, $"too few states exercised: {string.Join(",", states)}");
        Assert.True(minEnergy > 20 || states.Contains(CatState.Sleeping), "should nap when tired");
    }

    [Fact]
    public void Weights_NeverNegative_AndRespectNoRepeat()
    {
        var (brain, _, _) = Make();
        brain.RestoreMood(50, 50, 99);
        Assert.True(brain.RequestState(CatState.Dancing));
        var env = Env();
        foreach (CatState s in Enum.GetValues(typeof(CatState)))
        {
            var w = brain.WeightFor(s, env);
            Assert.True(w >= 0, $"{s} weight {w}");
        }
        Assert.Equal(0, brain.WeightFor(CatState.Dancing, env)); // no instant repeats
    }
}
