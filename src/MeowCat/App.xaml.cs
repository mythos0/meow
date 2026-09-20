// App.xaml.cs — composition root. Boots the cat overlay, tray, scanners,
// reminders and the (lazy, warm-hidden) settings window.
//
// RAM diet vs the Electron 3.x build (7 processes, ~400 MB):
//   • ONE process, no Chromium/V8/Node — WPF overlay only
//   • no PowerShell child processes for window scans (native EnumWindows)
//   • frozen brushes + pooled media players + 30 fps tick
//   • reminder balloon via the tray icon (no toast daemon)

namespace MeowCat;

using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Threading;
using MeowCat.Core.Brain;
using MeowCat.Core.Store;
using MeowCat.Platform;
using MeowCat.Windows;

public partial class App : Application, ICatTrayHost
{
    private static Mutex? _mutex;

    private SettingsStore _store = null!;
    private ReminderScheduler _scheduler = null!;
    private SoundService _sound = null!;
    private CatBrain _brain = null!;
    private CatOverlayWindow _overlay = null!;
    private TrayService _tray = null!;
    private WindowScanner _scanner = null!;
    private SettingsWindow? _settings;

    private DispatcherTimer _remTimer = null!;
    private DispatcherTimer _coinTimer = null!;

    [DllImport("kernel32.dll")]
    private static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr min, IntPtr max);

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // single instance
        _mutex = new Mutex(true, "MeowCat_SingleInstance", out var fresh);
        if (!fresh)
        {
            Shutdown(0);
            return;
        }

        // ---------------- settings (same file + format as the Electron build) ----------------
        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MeowCat");
        Directory.CreateDirectory(dir);
        string file = Path.Combine(dir, "meowcat-settings.json");
        _store = new SettingsStore(
            () => { try { return File.Exists(file) ? File.ReadAllText(file) : null; } catch { return null; } },
            s => { try { File.WriteAllText(file, s); } catch { } });

        _scheduler = new ReminderScheduler();
        foreach (var r in _store.Get(d => d.Reminders))
        {
            try { _scheduler.Add(r); } catch { /* skip invalid */ }
        }

        _sound = new SoundService();

        // ---------------- the cat ----------------
        var (wx, wy, ww, wh) = ScreenInfo.WorkArea;
        var data = _store.All;
        _brain = new CatBrain(
            breed: data.Breed,
            boundsX: 0, boundsY: 0, boundsW: ww, boundsH: wh,
            groundY: wh - 8,
            speed: data.Speed);

        _overlay = new CatOverlayWindow(
            _brain, _sound,
            openSettings: OpenSettings);
        _overlay.PetConfirmed += () => _store.AddCoins(2);
        _overlay.QuitRequested += Quit;
        _overlay.OpenReminders += OpenReminders;
        _overlay.ApplyView(data.Size, data.Opacity, data.Speed, data.Breed);
        _overlay.Show();

        // ---------------- window-top platform scanner (native, no child processes) ----------------
        _scanner = new WindowScanner(plats => _brain.SetPlatforms(plats.Select(p => new MeowCat.Core.Brain.Platform(p.X, p.Y, p.W, p.H))));
        if (OperatingSystem.IsWindows()) _scanner.Start();

        // ---------------- tray ----------------
        _tray = new TrayService(this, Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico"));

        // ---------------- background jobs ----------------
        _remTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _remTimer.Tick += (_, _) => PollReminders();
        _remTimer.Start();

        _coinTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _coinTimer.Tick += (_, _) => _store.AddCoins(1);
        _coinTimer.Start();

        // auto-start per stored setting (same behaviour as the Electron build)
        if (data.AutoStart != AutoStart.IsEnabled()) AutoStart.Set(data.AutoStart);

        // one-time working-set trim after the startup burst settles
        var trim = new DispatcherTimer { Interval = TimeSpan.FromSeconds(45) };
        trim.Tick += (_, _) =>
        {
            trim.Stop();
            try
            {
                if (OperatingSystem.IsWindows())
                    SetProcessWorkingSetSize(System.Diagnostics.Process.GetCurrentProcess().Handle, new IntPtr(-1), new IntPtr(-1));
            }
            catch { /* best effort */ }
        };
        trim.Start();
    }

    // ------------------------------------------------------------ reminders
    private void PollReminders()
    {
        var due = _scheduler.DueReminders();
        if (due.Count == 0) return;
        foreach (var item in due)
        {
            _overlay.FireReminder(item.Label);
            if (item.Sound) _sound.Play("meow_real.wav", 0.8);
            _tray.Balloon("🐱 " + item.Label, "Your cat has a message for you!",
                onClick: item.Anim == "dance" ? () => _overlay.DoAction("dance") : null);
        }
        _store.Set(d => d.Reminders = _scheduler.List());
    }

    // ------------------------------------------------------------ windows
    private void OpenSettings()
    {
        if (_settings == null)
        {
            _settings = new SettingsWindow(
                _store,
                coinsGetter: () => _store.Get(d => d.Coins),
                onBreedChanged: breed =>
                {
                    _brain.Breed = breed;
                    ApplyViewFromStore();
                },
                onSoundChanged: () => _sound.Enabled = _store.Get(d => d.Sounds),
                onAutoStartChanged: () => { try { AutoStart.Set(_store.Get(d => d.AutoStart)); } catch { } },
                onTopmostChanged: () => { /* overlay loop reads the flag each tick */ },
                onViewChanged: ApplyViewFromStore,
                listReminders: () => _scheduler.List(),
                addReminder: item => { try { _scheduler.Add(item); _store.Set(d => d.Reminders = _scheduler.List()); return true; } catch { return false; } },
                removeReminder: id => { bool ok = _scheduler.Remove(id); if (ok) _store.Set(d => d.Reminders = _scheduler.List()); return ok; },
                requestClose: () => _settings?.Hide());
        }
        _settings.SyncControls();
        _settings.Show();
        _settings.Activate();
    }

    private void OpenReminders()
    {
        OpenSettings();
        try { _settings?.FocusRemindersExternal(); } catch { }
    }

    private void ApplyViewFromStore()
    {
        var d = _store.All;
        _overlay.ApplyView(d.Size, d.Opacity, d.Speed, d.Breed);
    }

    // ------------------------------------------------------------ ICatTrayHost
    public void Dance() { _brain.Dance(); _sound.Play("dance_loop.wav", 0.5); }
    public void Feed() => _brain.Feed();
    public void SleepNow() => _brain.SleepNow();
    void ICatTrayHost.OpenSettings() => OpenSettings();
    void ICatTrayHost.OpenReminders() => OpenReminders();

    public void Quit()
    {
        try
        {
            _scanner.Dispose();
            _tray.Dispose();
            _remTimer?.Stop();
            _coinTimer?.Stop();
            _settings?.Close();
            _overlay.Close();
        }
        catch { }
        Shutdown(0);
    }

    public bool SoundOn => _store.Get(d => d.Sounds);
    public string BreedName => MeowCat.Core.Data.Catalog.PaletteOf(_brain.Breed).Name;

    public void ToggleSound()
    {
        bool on = !SoundOn;
        _store.Set(d => d.Sounds = on);
        _sound.Enabled = on;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
