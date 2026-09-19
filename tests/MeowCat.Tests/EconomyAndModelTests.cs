using System;
using System.IO;
using MeowCat.Core;
using Xunit;

namespace MeowCat.Tests;

public class CoinWalletTests
{
    [Fact]
    public void Starts_WithFunCoins()
    {
        Assert.Equal(CoinWallet.StartBalance, new CoinWallet().Balance);
        Assert.Equal(120, CoinWallet.StartBalance);
    }

    [Fact]
    public void Earn_Increases()
    {
        var w = new CoinWallet();
        w.Earn(5, "test");
        Assert.Equal(CoinWallet.StartBalance + 5, w.Balance);
    }

    [Fact]
    public void Spend_OnlyWithinBalance()
    {
        var w = new CoinWallet(10);
        Assert.True(w.TrySpend(7, "test"));
        Assert.Equal(3, w.Balance);
        Assert.False(w.TrySpend(5, "test"), "must refuse overdraft");
        Assert.Equal(3, w.Balance);
    }

    [Fact]
    public void NegativeAmounts_AreRejected()
    {
        var w = new CoinWallet();
        Assert.Throws<ArgumentOutOfRangeException>(() => w.Earn(-1, "test"));
        Assert.Throws<ArgumentOutOfRangeException>(() => w.TrySpend(-1, "test"));
    }

    [Fact]
    public void Changed_EventFires()
    {
        var w = new CoinWallet();
        var fired = 0;
        w.Changed += _ => fired++;
        w.Earn(1, "a");
        w.TrySpend(1, "b");
        w.TrySpend(999_999, "c");   // fails — no event
        Assert.Equal(2, fired);
    }
}

public class SettingsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "meowcat-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_dir, true); } catch (IOException) { }
    }

    [Fact]
    public void RoundTrip_PreservesEverything()
    {
        var store = new SettingsStore(_dir);
        var s = new MeowSettings
        {
            Coins = 777,
            CatName = "Biscuit",
            BreedId = "calico",
            Accessories = { "top_hat", "scarf" },
            EmotePackId = "sparkles",
            SizeScale = 1.5,
            Happiness = 42, Energy = 33, Boredom = 71,
        };
        store.Save(s);
        var loaded = store.Load();
        Assert.Equal(777, loaded.Coins);
        Assert.Equal("Biscuit", loaded.CatName);
        Assert.Equal("calico", loaded.BreedId);
        Assert.Equal(2, loaded.Accessories.Count);
        Assert.Equal("sparkles", loaded.EmotePackId);
        Assert.Equal(1.5, loaded.SizeScale);
        Assert.Equal(42, loaded.Happiness);
    }

    [Fact]
    public void CorruptFile_FallsBackToDefaults_WithBackup()
    {
        var store = new SettingsStore(_dir);
        File.WriteAllText(store.FilePath, "{ this is not json !!!");
        var loaded = store.Load();
        Assert.Equal(new MeowSettings().CatName, loaded.CatName);
        Assert.Equal(CoinWallet.StartBalance, loaded.Coins);
        Assert.NotEmpty(Directory.GetFiles(_dir, "config.json.corrupt-*"));
    }

    [Fact]
    public void MissingFile_ReturnsDefaults()
    {
        var store = new SettingsStore(_dir);
        var s = store.Load();
        Assert.Equal("Mochi", s.CatName);
        Assert.True(s.SoundEnabled);
        Assert.Contains("orange_tabby", s.OwnedItems);
    }

    [Fact]
    public void Sanitize_ClampsCrazyValues()
    {
        var store = new SettingsStore(_dir);
        store.Save(new MeowSettings { Coins = -50, SizeScale = 9.9, Happiness = -100, Energy = 500, Boredom = -3 });
        var s = store.Load();
        Assert.Equal(0, s.Coins);
        Assert.Equal(2.0, s.SizeScale);
        Assert.Equal(0, s.Happiness);
        Assert.Equal(100, s.Energy);
        Assert.Equal(0, s.Boredom);
    }
}

public class CatModelTests
{
    [Fact]
    public void Walking_Moves_AndBouncesAtBounds()
    {
        var m = new CatModel { MaxX = 400, MinX = 0, X = 380, Y = 1000 };
        var dir0 = m.StartGroundMove(new Random(1), running: false);
        var flipped = false;
        for (var i = 0; i < 2000; i++)
        {
            m.Tick(0.05, CatState.Walking);
            Assert.InRange(m.X, 0, 400);
            if (m.Facing != dir0) flipped = true;
        }
        Assert.True(flipped, "should bounce off at least one wall");
    }

    [Fact]
    public void Jump_CompletesAtPlannedTime()
    {
        var m = new CatModel();
        m.StartJump(new JumpPlan(0, 1000, 300, 1000, 1.5, 100));
        var t = 0.0;
        var done = false;
        while (t < 3 && !done) { done = m.Tick(0.05, CatState.Jumping); t += 0.05; }
        Assert.True(done);
        Assert.InRange(t, 1.45, 1.65);
        Assert.Equal(300, m.X, 1);
        Assert.Equal(1000, m.Y, 1);
    }
}

public class CatStateInfoTests
{
    [Fact]
    public void Dragging_BlocksAllCommands()
    {
        Assert.True(CatStateInfo.CanTransition(CatState.Walking, CatState.Dragged));
        Assert.False(CatStateInfo.CanTransition(CatState.Dragged, CatState.Dancing));
        Assert.True(CatStateInfo.CanTransition(CatState.Dragged, CatState.Sitting));
    }

    [Fact]
    public void Jumping_BlocksInterrupts()
    {
        Assert.False(CatStateInfo.CanTransition(CatState.Jumping, CatState.Dancing));
        Assert.True(CatStateInfo.CanTransition(CatState.Jumping, CatState.Sitting));
    }

    [Fact]
    public void FiniteStates_AreMarked()
    {
        Assert.True(CatStateInfo.IsFinite(CatState.Dancing));
        Assert.True(CatStateInfo.IsFinite(CatState.Sleeping));
        Assert.False(CatStateInfo.IsFinite(CatState.Dragged));
        Assert.False(CatStateInfo.IsFinite(CatState.Jumping));
    }
}
