using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MeowCat.Core;
using Xunit;

namespace MeowCat.Tests;

/// <summary>v3 features: high-frame-count catalog, platform strolling, desktop strolls,
/// reminders, topmost enforcer API, settings additions.</summary>
public class V3FeatureTests
{
    // ------------------------------------------------------------ sprite catalog

    [Fact]
    public void Catalog_DefaultBreed_HasHighFrameCounts()
    {
        // motion clips: 8 interleaved frames; stationary: 4
        Assert.Equal(8, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "walk"));
        Assert.Equal(8, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "run"));
        Assert.Equal(8, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "jump"));
        Assert.Equal(8, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "dance"));
        Assert.Equal(8, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "scratch"));
        Assert.Equal(4, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "sit"));
        Assert.Equal(4, SpriteCatalog.KnownGeneratedCounts("grey_tabby", "sleep"));
    }

    [Fact]
    public void Catalog_MaxFramesPerClip_Is8()
    {
        Assert.Equal(8, SpriteCatalog.MaxFramesPerClip);
    }

    [Fact]
    public void Catalog_FrameFiles_WithinClipCount()
    {
        var rc = SpriteCatalog.Resolve("grey_tabby", CatState.Walking);
        var files = SpriteCatalog.FrameFiles(rc);
        Assert.Equal(8, files.Count);
        Assert.All(files, f => Assert.StartsWith("Assets/sprites/grey_tabby/walk/", f));
        // FrameFile must always stay inside the registered count (loop wraps by modulo)
        var f0 = SpriteCatalog.FrameFile(rc, 0);
        var f8 = SpriteCatalog.FrameFile(rc, 8);   // 8 % 8 = 0 → wraps to frame 0
        Assert.Equal(f0, f8);
    }

    // ------------------------------------------------------------ platform brain

    private static (CatBrain Brain, CatModel Model) MakeBrain(int seed = 7)
    {
        var model = new CatModel { MaxX = 1920, X = 600, Y = 1040 };
        var brain = new CatBrain(model, null, seed);
        return (brain, model);
    }

    private static BrainEnvironment Env(IReadOnlyList<TargetWindow>? windows = null,
        IReadOnlyList<(double X, double Y)>? desktop = null)
    {
        desktop ??= Array.Empty<(double, double)>();
        return new BrainEnvironment
        {
            ScreenWidth = 1920, ScreenHeight = 1080, FloorY = 1040,
            Windows = windows ?? Array.Empty<TargetWindow>(),
            DesktopPoints = desktop,
        };
    }

    [Fact]
    public void Platform_JumpLandsOnWindowTop_AndRegistersPlatform()
    {
        var (brain, model) = MakeBrain();
        model.X = 600; model.Y = 1040;
        var win = new TargetWindow("Explorer", 400, 640, 640, 400);
        brain.StartJumpTo(win);
        var elapsed = 0.0;
        while (brain.State == CatState.Jumping && elapsed < 10) { brain.Tick(0.016, Env(new[] { win })); elapsed += 0.016; }
        Assert.Equal(win.TopY, model.Y, 1);
        Assert.NotNull(brain.CurrentPlatform);
        Assert.Equal("Explorer", brain.CurrentPlatform!.Title);
    }

    [Fact]
    public void Platform_WalkingOnTop_IsClampedToWindowSpan()
    {
        var (brain, model) = MakeBrain();
        var win = new TargetWindow("Wide", 500, 700, 300, 300);   // span 500..800
        model.X = 650; model.Y = win.TopY;
        brain.RequestState(CatState.Walking);
        // while the cat stays on the platform it must remain inside the window span;
        // the brain may legitimately hop down, after which the floor rules apply
        for (var i = 0; i < 600; i++)
        {
            brain.Tick(0.016, Env(new[] { win }));
            if (brain.CurrentPlatform is not null)
            {
                Assert.InRange(model.Y, win.TopY - CatBrain.PlatformTopTolerance, win.TopY + CatBrain.PlatformTopTolerance);
                Assert.InRange(model.X, 500 + 24 + 39, 800 - 24 - 39);
            }
        }
    }

    [Fact]
    public void Platform_AutoHopTriggers_WhenWalkingNearATabTop()
    {
        var (brain, model) = MakeBrain();
        model.X = 600; model.Y = 1040;
        var win = new TargetWindow("Near", 700, 800, 400, 240);   // top edge 240 above floor, ahead to the right
        brain.RequestState(CatState.Walking);
        var jumped = false;
        var elapsed = 0.0;
        while (elapsed < 30)
        {
            brain.Tick(0.05, Env(new[] { win }));
            elapsed += 0.05;
            if (brain.State == CatState.Jumping) { jumped = true; break; }
        }
        Assert.True(jumped, "cat should spontaneously hop onto the nearby tab top");
    }

    [Fact]
    public void Platform_NearestOtherWindow_IsNotTheCurrentOne()
    {
        var (brain, model) = MakeBrain();
        var here = new TargetWindow("Here", 500, 700, 400, 300);
        var there = new TargetWindow("There", 1200, 700, 400, 300);
        model.X = 700; model.Y = here.TopY;
        brain.StartJumpTo(here);
        for (var i = 0; i < 400 && brain.State == CatState.Jumping; i++)
            brain.Tick(0.016, Env(new[] { here, there }));
        Assert.Equal("Here", brain.CurrentPlatform?.Title);
        // after landing, the next autonomous pick should sometimes jump to "There" (not "Here")
        var seen = new HashSet<string?>();
        for (var i = 0; i < 4000 && seen.Count < 2; i++)
        {
            brain.Tick(0.05, Env(new[] { here, there }));
            if (brain.State == CatState.Jumping && brain.Model.Jump is { } j)
                seen.Add(j.EndX > 1000 ? "There" : "Here");
        }
        Assert.Contains("There", seen);
    }

    [Fact]
    public void DesktopStroll_WalksTowardIcons_WhenNoWindows()
    {
        var (brain, model) = MakeBrain();
        var points = new List<(double, double)> { (200, 1000), (500, 1000), (900, 1000) };
        model.X = 700; model.Y = 1040;
        brain.RequestState(CatState.Walking);
        // over the stroll the cat must visit the icon neighbourhoods (purposeful walking)
        var minX = model.X; var maxX = model.X;
        for (var i = 0; i < 3000; i++)
        {
            brain.Tick(0.05, Env(null, points));
            minX = Math.Min(minX, model.X);
            maxX = Math.Max(maxX, model.X);
        }
        Assert.True(minX < 400 || maxX > 800, $"cat never strolled to the icons: [{minX}, {maxX}]");
    }

    // ------------------------------------------------------------ reminders

    [Fact]
    public void ReminderStore_RoundTrips()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new ReminderStore(dir);
            var list = new List<Reminder>
            {
                new() { Title = "Stand up", Message = "Stretch!", Time = DateTime.Now.AddMinutes(5),
                        Repeat = ReminderRepeat.Daily, Movement = nameof(CatState.Dancing) },
                new() { Title = "Tea", Time = DateTime.Now.AddMinutes(30), Repeat = ReminderRepeat.Once },
            };
            store.Save(list);
            var loaded = store.Load();
            Assert.Equal(2, loaded.Count);
            Assert.Contains(loaded, r => r.Title == "Stand up" && r.Repeat == ReminderRepeat.Daily);
            Assert.Contains(loaded, r => r.Movement == nameof(CatState.Dancing));
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void ReminderStore_CorruptFile_ReturnsEmpty()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, "reminders.json"), "{ not valid json !!!");
            var loaded = new ReminderStore(dir).Load();
            Assert.Empty(loaded);
            // a .corrupt backup was kept
            Assert.Contains(Directory.GetFiles(dir), f => f.Contains(".corrupt-"));
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void ReminderService_OneShot_FiresOnce_AndDisables()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new ReminderStore(dir);
            var r = new Reminder { Title = "Once", Time = DateTime.Now.AddMilliseconds(50), Repeat = ReminderRepeat.Once };
            var svc = new ReminderService(new List<Reminder> { r }, store);
            var fired = 0;
            svc.ReminderFired += _ => fired++;
            svc.Tick(DateTime.Now.AddMilliseconds(60));
            svc.Tick(DateTime.Now.AddMilliseconds(1600));
            svc.Tick(DateTime.Now.AddMilliseconds(2600));
            Assert.Equal(1, fired);
            Assert.False(r.Enabled);
            Assert.True(r.FiredOnce);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void ReminderService_Repeating_RollsForward()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new ReminderStore(dir);
            var t = DateTime.Now.AddSeconds(1);
            var r = new Reminder { Title = "Loop", Time = t, Repeat = ReminderRepeat.EveryHour, Enabled = true };
            var svc = new ReminderService(new List<Reminder> { r }, store);
            var fired = 0;
            svc.ReminderFired += _ => fired++;
            // first Tick is the "first run": only items ≤5 min late fire
            svc.Tick(DateTime.Now.AddSeconds(90));
            Assert.Equal(1, fired);
            Assert.True(r.Time > DateTime.Now, "repeating reminder must roll to the future");
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void ReminderService_FirstRun_IgnoresVeryOldReminders()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new ReminderStore(dir);
            var r = new Reminder { Title = "Stale", Time = DateTime.Now.AddDays(-3), Repeat = ReminderRepeat.Once, Enabled = true };
            var svc = new ReminderService(new List<Reminder> { r }, store);
            var fired = 0;
            svc.ReminderFired += _ => fired++;
            svc.Tick(DateTime.Now);          // first run — stale one-shots stay silent
            Assert.Equal(0, fired);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public void Reminder_NextOccurrence_IsFuture()
    {
        var from = new DateTime(2026, 1, 1, 8, 0, 0);
        Assert.Equal(from.AddDays(1), ReminderService.NextOccurrence(
            new Reminder { Repeat = ReminderRepeat.Daily }, from));
        Assert.Equal(from.AddDays(7), ReminderService.NextOccurrence(
            new Reminder { Repeat = ReminderRepeat.Weekly }, from));
        Assert.Equal(from.AddMinutes(30), ReminderService.NextOccurrence(
            new Reminder { Repeat = ReminderRepeat.Every30Minutes }, from));
        Assert.Equal(from, ReminderService.NextOccurrence(
            new Reminder { Repeat = ReminderRepeat.Once }, from));
    }

    [Fact]
    public void Reminder_MovementState_FallsBackToDancing()
    {
        Assert.Equal(CatState.Jumping, Reminder.MovementState("Jumping"));
        Assert.Equal(CatState.Scratching, Reminder.MovementState("Scratching"));
        Assert.Equal(CatState.Dancing, Reminder.MovementState("Bogus"));
        Assert.Equal(CatState.Dancing, Reminder.MovementState(""));
    }

    // ------------------------------------------------------------ misc platform

    [Fact]
    public void Settings_AutoStartField_Persists()
    {
        var dir = Path.Combine(Path.GetTempPath(), "meow_tests_" + Guid.NewGuid().ToString("N"));
        try
        {
            var store = new SettingsStore(dir);
            var s = store.Load();
            s.AutoStartEnabled = true;
            s.ReminderPopupsEnabled = false;
            store.Save(s);
            var reloaded = store.Load();
            Assert.True(reloaded.AutoStartEnabled);
            Assert.False(reloaded.ReminderPopupsEnabled);
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
    }
}
