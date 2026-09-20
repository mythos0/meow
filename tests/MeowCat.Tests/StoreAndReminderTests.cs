// StoreAndReminderTests.cs — settings persistence (same JSON format as the
// Electron build), economy promo, reminder scheduler recurrence + grace.

namespace MeowCat.Tests;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MeowCat.Core.Store;
using Xunit;

public class StoreAndReminderTests : IDisposable
{
    private readonly string _file;

    public StoreAndReminderTests()
    {
        _file = Path.Combine(Path.GetTempPath(), $"meow-test-{Guid.NewGuid():N}.json");
    }

    public void Dispose()
    {
        try { File.Delete(_file); } catch { }
    }

    private SettingsStore MakeStore() => new(
        () => File.Exists(_file) ? File.ReadAllText(_file) : null,
        s => File.WriteAllText(_file, s));

    // ---------------------------------------------------------------- defaults & sanitize
    [Fact]
    public void Fresh_store_gets_unlimited_promo()
    {
        var store = MakeStore();
        var d = store.All;
        Assert.Equal("grey_tabby", d.Breed);
        Assert.True(d.UnlimitedCoins);
        Assert.Equal(999999, d.Coins);
        // promo grants every breed
        Assert.Equal(21, d.Owned.Count);
    }

    [Fact]
    public void Corrupt_file_recovers_cleanly()
    {
        File.WriteAllText(_file, "{ this is not json !!!");
        var store = MakeStore();
        Assert.Equal("grey_tabby", store.All.Breed);
        Assert.True(store.All.UnlimitedCoins);
    }

    [Fact]
    public void Round_trip_persists_breed_and_reminders()
    {
        var store = MakeStore();
        store.Set(d => d.Breed = "panda");
        store.Set(d => d.Reminders = new List<ReminderItem>
        {
            new() { Id = "r1", Label = "Tea", At = 123456, Repeat = "daily", Anim = "dance", Sound = true },
        });
        var store2 = MakeStore();   // re-open from disk
        Assert.Equal("panda", store2.All.Breed);
        var rems = store2.Get(d => d.Reminders);
        Assert.Single(rems);
        Assert.Equal("Tea", rems[0].Label);
        Assert.Equal("daily", rems[0].Repeat);
        // JSON is camelCase (Electron file compatible)
        string raw = File.ReadAllText(_file);
        Assert.Contains("\"breed\":\"panda\"", raw);
        Assert.Contains("\"unlimitedCoins\":true", raw);
    }

    [Fact]
    public void Existing_electron_settings_file_is_adopted()
    {
        // exactly the shape settings-store.js writes
        File.WriteAllText(_file,
            "{\"breed\":\"mochi\",\"size\":1.3,\"opacity\":0.85,\"sounds\":true,\"autoStart\":true," +
            "\"topmost\":true,\"speed\":70,\"coins\":1234,\"unlimitedCoins\":true," +
            "\"owned\":[\"grey_tabby\",\"mochi\"],\"reminders\":[],\"version\":1}");
        var store = MakeStore();
        var d = store.All;
        Assert.Equal("mochi", d.Breed);
        Assert.Equal(1.3, d.Size);
        Assert.Equal(70, d.Speed);
        Assert.True(d.AutoStart);
        Assert.Equal(1234, d.Coins);
        Assert.Equal(21, d.Owned.Count);   // promo expands owned
    }

    // ---------------------------------------------------------------- economy
    [Fact]
    public void BuyBreed_is_free_with_promo()
    {
        var store = MakeStore();
        long before = store.Get(d => d.Coins);
        var r = store.BuyBreed("panda");
        Assert.True(r.Ok);
        // promo pre-grants every breed, so buying is a no-op: free or already owned
        Assert.True(r.Free || r.AlreadyOwned);
        Assert.Equal(before, store.Get(d => d.Coins));   // nothing deducted
        Assert.Contains("panda", store.All.Owned);
    }

    [Fact]
    public void BuyBreed_without_promo_costs_coins()
    {
        var store = MakeStore();
        store.Set(d => { d.UnlimitedCoins = false; d.Coins = 300; d.Owned = new List<string> { "grey_tabby" }; });
        var ok = store.BuyBreed("orange_tabby");   // 100
        Assert.True(ok.Ok);
        Assert.Equal(200, ok.Coins);
        var fail = store.BuyBreed("panda");        // 1000 > 200
        Assert.False(fail.Ok);
        Assert.Equal(800, fail.Needed);
    }

    [Fact]
    public void AddCoins_clamps()
    {
        var store = MakeStore();
        Assert.Equal(9999999, store.AddCoins(10000000));
        store.Set(d => d.Coins = 5);
        Assert.Equal(0, store.AddCoins(-100));
    }

    // ---------------------------------------------------------------- reminders
    [Fact]
    public void Once_fires_and_is_removed()
    {
        long now = 1_000_000;
        var sched = new ReminderScheduler(() => now);
        sched.Add(new ReminderItem { Label = "hi", At = now + 5000, Repeat = "once" });
        Assert.Empty(sched.DueReminders());
        now += 5001;
        var due = sched.DueReminders();
        Assert.Single(due);
        Assert.Equal(0, sched.Size);   // removed after firing
    }

    [Fact]
    public void Daily_reschedules_forward()
    {
        long now = 1_000_000;
        var sched = new ReminderScheduler(() => now);
        long at0 = now + 1000;
        sched.Add(new ReminderItem { Label = "daily", At = at0, Repeat = "daily" });
        now += 1001;
        var due = sched.DueReminders();
        Assert.Single(due);
        Assert.Equal(1, sched.Size);
        // the next occurrence steps from the ORIGINAL time (JS parity)
        Assert.Equal(at0 + 86400000, sched.List()[0].At);
    }

    [Fact]
    public void Missed_beyond_grace_is_skipped()
    {
        long now = 1_000_000;
        var sched = new ReminderScheduler(() => now);
        sched.Add(new ReminderItem { Label = "old", At = now + 1000, Repeat = "once" });
        now += 1_000_000;   // way past the 60s grace
        Assert.Empty(sched.DueReminders());
        Assert.Equal(0, sched.Size);
    }

    [Fact]
    public void Hourly_and_weekly_steps()
    {
        long now = 5_000_000;
        var sched = new ReminderScheduler(() => now);
        long h0 = now + 1, w0 = now + 1;
        sched.Add(new ReminderItem { Label = "h", At = h0, Repeat = "hourly" });
        sched.Add(new ReminderItem { Label = "w", At = w0, Repeat = "weekly" });
        now += 2;
        sched.DueReminders();
        var items = sched.List();
        Assert.Contains(items, i => i.Label == "h" && i.At == h0 + 3600000);
        Assert.Contains(items, i => i.Label == "w" && i.At == w0 + 604800000);
    }

    [Fact]
    public void List_is_sorted_by_time()
    {
        long now = 1_000_000;
        var sched = new ReminderScheduler(() => now);
        sched.Add(new ReminderItem { Label = "later", At = now + 10000 });
        sched.Add(new ReminderItem { Label = "sooner", At = now + 100 });
        var list = sched.List();
        Assert.Equal("sooner", list[0].Label);
    }
}
