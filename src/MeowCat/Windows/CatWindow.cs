using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using MeowCat.Core;
using MeowCat.Platform;
using MeowCat.Rendering;
using FormsCursor = System.Windows.Forms.Cursor;

namespace MeowCat.Windows;

/// <summary>
/// The always-on-top transparent overlay that carries the cat across the entire screen.
/// Sized to the sprite art box (transparent pixels pass clicks through), driven by a
/// 60 FPS DispatcherTimer: brain tick → model physics → render spec → sprite paint.
/// v3: frame-count rich realistic cat, ANGRY MODE glass scratches, TOPMOST ENFORCEMENT
/// (never hidden behind fullscreen apps), tab-top auto hopping, desktop-folder strolls,
/// reminders with speech-bubble notifications and a settings window.
/// </summary>
public sealed class CatWindow : Window, ICatCommandHost
{
    private readonly MeowSettings _settings;
    private readonly SettingsStore _store;
    private readonly CoinWallet _wallet;
    private readonly SoundService _sound;
    private readonly CatModel _model = new();
    private readonly CatBrain _brain;
    private readonly CatControl _cat = new();
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(16) };
    private readonly DispatcherTimer _scanTimer = new() { Interval = TimeSpan.FromSeconds(1.2) };
    private readonly DispatcherTimer _saveTimer = new() { Interval = TimeSpan.FromSeconds(30) };
    private readonly DispatcherTimer _reminderTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly Random _rng = new();

    private StoreWindow? _storeWindow;
    private ReminderWindow? _reminderWindow;
    private SettingsWindow? _settingsWindow;
    private TrayService? _tray;
    private GlassOverlayWindow? _glass;
    private IntPtr _hwnd = IntPtr.Zero;
    private DateTime _lastMouseMove = DateTime.MinValue;
    private (double X, double Y) _lastMouse;
    private double _loopSoundTimer;
    private bool _dragging;
    private Point _dragStartRelative;
    private DateTime _lastClick = DateTime.MinValue;
    private IReadOnlyList<TargetWindow> _empty = Array.Empty<TargetWindow>();
    private IReadOnlyList<(double X, double Y)> _emptyPoints = Array.Empty<(double, double)>();

    // speech bubble state
    private string? _bubbleTitle;
    private string? _bubbleMessage;
    private double _bubbleElapsed;

    // desktop stroll cache
    private List<(double X, double Y)> _desktopPoints = new();
    private DateTime _desktopScanAt = DateTime.MinValue;

    private readonly ReminderService _reminders;

    public CatWindow(MeowSettings settings, SettingsStore store, CoinWallet wallet, SoundService sound)
    {
        _settings = settings;
        _store = store;
        _wallet = wallet;
        _sound = sound;
        _brain = new CatBrain(_model, _wallet);
        _reminders = new ReminderService(new ReminderStore().Load(), new ReminderStore());

        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        ResizeMode = ResizeMode.NoResize;
        Content = _cat;
        Title = "MeowCat";
        ApplySize();

        _brain.RestoreMood(settings.Happiness, settings.Energy, settings.Boredom);
        _model.Scale = settings.SizeScale;
        _brain.StateChanged += OnStateChanged;
        _brain.BecameAngry += OnBecameAngry;
        _brain.CalmedDown += OnCalmedDown;
        _wallet.Changed += amount => _cat.CoinPopups.Add((amount, 0));
        _reminders.ReminderFired += OnReminderFired;

        _cat.MouseLeftButtonDown += OnCatMouseDown;
        _cat.MouseMove += OnCatMouseMove;
        _cat.MouseLeftButtonUp += OnCatMouseUp;
        _cat.ContextMenuOpening += (_, _) => _cat.ContextMenu = MenuBuilder.Build(this);

        Loaded += (_, _) =>
        {
            _hwnd = new WindowInteropHelper(this).Handle;
            SpriteRenderer.PrimeCatalog();
            var wa = ScreenInfo.WorkArea;
            _model.X = wa.X + wa.W * 0.72;
            _model.Y = wa.Y + wa.H;
            _timer.Tick += (_, _) => Frame();
            _timer.Start();
            _scanTimer.Tick += (_, _) => ScanWindows();
            _scanTimer.Start();
            _saveTimer.Tick += (_, _) => Persist();
            _saveTimer.Start();
            _reminderTimer.Tick += (_, _) => _reminders.Tick(DateTime.Now);
            _reminderTimer.Start();
            try
            {
                _tray = new TrayService(this, System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico"));
            }
            catch (Exception) { /* tray optional */ }
        };
        Closed += (_, _) => { _tray?.Dispose(); _glass?.ClearNow(); Persist(); };
    }

    // ------------------------------------------------------------------ frame

    private double PadTop => 96 * _settings.SizeScale;   // extra headroom for the speech bubble

    private void Frame()
    {
        var dt = 0.016;

        // environment
        var wa = ScreenInfo.WorkArea;
        var floorY = wa.Y + wa.H;

        var mp = FormsCursor.Position;
        var mx = ScreenInfo.PxToDiu(mp.X);
        var my = ScreenInfo.PxToDiu(mp.Y);
        var moved = Math.Abs(mx - _lastMouse.X) + Math.Abs(my - _lastMouse.Y) > 4;
        if (moved) _lastMouseMove = DateTime.UtcNow;
        _lastMouse = (mx, my);

        if (!_dragging && _brain.State != CatState.Jumping && _brain.State != CatState.Dragged)
            _model.Y = _brain.CurrentPlatform?.TopY ?? floorY;

        _brain.Tick(dt, new BrainEnvironment
        {
            ScreenWidth = wa.W,
            ScreenHeight = wa.H,
            FloorY = floorY,
            MouseX = mx,
            MouseY = my,
            MouseRecentlyMoved = (DateTime.UtcNow - _lastMouseMove).TotalSeconds < 1.5,
            Windows = _brain.AvailableWindows ?? _empty,
            DesktopPoints = _brain.AvailableWindows is { Count: > 0 } ? _emptyPoints : DesktopPointsSafe(),
        });

        // a claw swipe just happened → break the glass at the paw point
        if (_brain.ConsumeSwipe())
            ScreenScratch();

        _loopSoundTimer += dt;
        var loop = SoundCatalog.LoopFor(_brain.State);
        if (loop is not null && _loopSoundTimer >= SoundCatalog.LoopIntervalFor(_brain.State))
        {
            _loopSoundTimer = 0;
            _sound.Play(loop);
        }

        // coin popups age
        for (var i = _cat.CoinPopups.Count - 1; i >= 0; i--)
        {
            var p = _cat.CoinPopups[i];
            p.Elapsed += dt;
            if (p.Elapsed > 1.25) _cat.CoinPopups.RemoveAt(i);
        }

        // speech bubble ages
        if (_bubbleTitle is not null)
        {
            _bubbleElapsed += dt;
            if (_bubbleElapsed > 7) { _bubbleTitle = null; _bubbleMessage = null; }
        }

        // position window under the model (feet at the bottom edge)
        if (!_dragging)
        {
            Left = _model.X - Width / 2;
            Top = _model.Y - Height;
        }

        // paint
        _cat.Spec = new RenderSpec
        {
            State = _brain.State,
            Time = _brain.StateTime,
            Facing = _model.Facing,
            Scale = _settings.SizeScale,
            BreedId = _settings.BreedId,
            Accessories = _settings.Accessories,
            EmotePack = _settings.EmotePackId,
            AirHeight = Math.Max(0, floorY - _model.Y),
            CanvasW = SpriteRenderer.Box * _settings.SizeScale,
            CanvasH = SpriteRenderer.Box * _settings.SizeScale + PadTop,
            ArtTop = PadTop,
            SpeechText = _bubbleTitle,
            SpeechMessage = _bubbleMessage,
            SpeechElapsed = _bubbleElapsed,
        };
        _cat.InvalidateVisual();
    }

    /// <summary>Desktop icon waypoints, refreshed at most every 20 s (shell calls are pricey).</summary>
    private IReadOnlyList<(double X, double Y)> DesktopPointsSafe()
    {
        if ((DateTime.UtcNow - _desktopScanAt).TotalSeconds < 20) return _desktopPoints;
        _desktopScanAt = DateTime.UtcNow;
        try
        {
            _desktopPoints = new List<(double, double)>();
            var wa = ScreenInfo.WorkArea;
            var pts = DesktopIcons.GetIconPositions(48);
            if (pts.Count == 0)
            {
                // synthesized fallback grid along the left side of the desktop
                var synth = DesktopIcons.SynthLayout((int)wa.W, (int)wa.H, 10);
                foreach (var (px, py) in synth)
                    _desktopPoints.Add((ScreenInfo.PxToDiu(px), ScreenInfo.PxToDiu(py)));
            }
            else
            {
                foreach (var (px, py) in pts)
                    _desktopPoints.Add((ScreenInfo.PxToDiu(px), ScreenInfo.PxToDiu(wa.Y > 0 ? py - (int)wa.Y : py)));
            }
        }
        catch (Exception)
        {
            _desktopPoints = new List<(double, double)>();
        }
        return _desktopPoints;
    }

    // ------------------------------------------------------- topmost enforcement

    /// <summary>Keeps the cat (and glass) above fullscreen windows. Cheap native call, no focus steal.</summary>
    private void EnforceTopmost()
    {
        if (_hwnd == IntPtr.Zero) return;
        TopmostEnforcer.MakeTopmost(_hwnd);
        Topmost = true;
        if (_glass is { IsLoaded: true, IsVisible: true })
        {
            var ghwnd = _glass.WindowHandle;
            if (ghwnd != IntPtr.Zero) TopmostEnforcer.MakeTopmost(ghwnd);
        }
    }

    // ------------------------------------------------------- angry scratch feature

    private void OnBecameAngry()
    {
        // the glass overlay lives until the cat calms down again
        EnsureGlass();
        _glass!.Show();
        _sound.Play(SoundCatalog.GrowlReal);
    }

    private void OnCalmedDown()
    {
        _glass?.CalmDown();                       // all cracks fade away together
        _sound.Play(SoundCatalog.PurrReal);
    }

    private void EnsureGlass()
    {
        if (_glass is { IsLoaded: true }) return;
        _glass = new GlassOverlayWindow();
        _glass.Show();
        _glass.Hide();                            // keep it alive but invisible until needed
    }

    /// <summary>One claw swipe just landed: stamp realistic glass cracks at the paw point.</summary>
    private void ScreenScratch()
    {
        try
        {
            EnsureGlass();
            _glass!.Show();

            // the paws land slightly ahead of the cat, at chest height
            var gx = _model.X + _model.Facing * 60 * _settings.SizeScale;
            var gy = _model.Y - 170 * _settings.SizeScale;
            var decals = DecalPlanner.Plan(gx, gy,
                SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight, _rng);
            _glass.AddScratches(gx, gy, decals);
            _sound.Play(SoundCatalog.GlassReal);
            if (_rng.NextDouble() < 0.4) _sound.Play(SoundCatalog.HissReal);
        }
        catch (Exception) { /* never let cosmetics kill the cat */ }
    }

    private void ScanWindows()
    {
        if (!OperatingSystem.IsWindows()) return;

        EnforceTopmost();

        try
        {
            var list = new List<TargetWindow>();
            foreach (var w in WindowEnumerator.GetJumpTargets())
            {
                list.Add(new TargetWindow(w.Title, ScreenInfo.PxToDiu(w.X), ScreenInfo.PxToDiu(w.Y),
                    ScreenInfo.PxToDiu(w.Width), ScreenInfo.PxToDiu(w.Height)));
            }
            _brain.AvailableWindows = list;
        }
        catch (Exception) { /* keep old list */ }
    }

    private void OnStateChanged(CatState oldS, CatState newS)
    {
        _loopSoundTimer = 0;
        var entry = SoundCatalog.EntryFor(newS, _rng);
        if (entry is not null) _sound.Play(entry);
        if (oldS == CatState.Jumping) _sound.Play(SoundCatalog.Land);
        if (newS == CatState.ScratchAttack) _sound.Play(SoundCatalog.ScratchFoley);
    }

    // ------------------------------------------------------------- reminders

    private void OnReminderFired(Reminder r)
    {
        try
        {
            if (_settings.ReminderPopupsEnabled)
            {
                _bubbleTitle = "⏰ " + r.Title;
                _bubbleMessage = r.Message;
                _bubbleElapsed = 0;
            }
            if (_settings.SoundEnabled && r.SoundOn)
                _sound.Play(SoundCatalog.RandomMeow(_rng));

            // the cat performs the movement the user picked for this reminder
            var movement = Reminder.MovementState(r.Movement);
            _brain.RequestState(movement);

            _tray?.ShowBalloon(r.Title, string.IsNullOrWhiteSpace(r.Message)
                ? "MeowCat reminder"
                : r.Message);
        }
        catch (Exception) { /* a missed reminder must never crash the cat */ }
    }

    // ------------------------------------------------------------------ input

    private void OnCatMouseDown(object sender, MouseButtonEventArgs e)
    {
        var pos = e.GetPosition(_cat);
        _dragStartRelative = pos;
        _dragging = false;
        _cat.CaptureMouse();
    }

    private void OnCatMouseMove(object sender, MouseEventArgs e)
    {
        if (!_cat.IsMouseCaptured) return;
        var pos = e.GetPosition(_cat);
        var dx = pos.X - _dragStartRelative.X;
        var dy = pos.Y - _dragStartRelative.Y;
        if (!_dragging && Math.Abs(dx) + Math.Abs(dy) > 8)
        {
            _dragging = _brain.BeginDrag();
        }
        if (!_dragging) return;

        Left += dx;
        Top += dy;
        _model.X = Left + Width / 2;
        _model.Y = Top + Height;
    }

    private void OnCatMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (_cat.IsMouseCaptured) _cat.ReleaseMouseCapture();
        if (_dragging)
        {
            _dragging = false;
            _brain.EndDrag();
            Persist();
            return;
        }
        // ANGRY MODE: a click is not a pet — it is a claw attack on the screen!
        if (_brain.IsAngry)
        {
            _brain.ScratchAttackAt();
            return;
        }
        // a click = pet the cat; two quick clicks = meow
        var now = DateTime.UtcNow;
        var dbl = (now - _lastClick).TotalMilliseconds < 350;
        _lastClick = now;
        _brain.TryPet();
        if (dbl) _sound.Play(SoundCatalog.RandomMeow(_rng));
    }

    // ------------------------------------------------------------- ICatCommandHost

    public void DoFeed()
    {
        if (_brain.RequestFeed()) _sound.Play(SoundCatalog.Chirp);
    }

    public void DoDance() => _brain.RequestState(CatState.Dancing);
    public void DoSleep() => _brain.RequestState(CatState.Sleeping);
    public void DoPlay() => _brain.RequestState(CatState.PlayingYarn);

    public void DoMakeAngry()
    {
        if (_brain.MakeAngry()) return;
        _brain.Calm();           // already angry → the menu item doubles as "calm down"
    }

    public bool SoundOn => _sound.Enabled;
    public bool IsAngryVisible => _brain.IsAngry;
    public void ToggleSound() { _sound.Enabled = !_sound.Enabled; _settings.SoundEnabled = _sound.Enabled; Persist(); }
    public double CurrentSize => _settings.SizeScale;
    public string CatName => _settings.CatName;

    public void SetSize(double scale)
    {
        _settings.SizeScale = Math.Clamp(scale, 0.5, 2.0);
        _model.Scale = _settings.SizeScale;
        ApplySize();
        Persist();
    }

    public void DoStore()
    {
        if (_storeWindow is { IsLoaded: true })
        {
            _storeWindow.Activate();
            return;
        }
        _storeWindow = new StoreWindow(_settings, _store, _wallet)
        {
            OnApplied = () => { ApplySize(); },
        };
        _storeWindow.Show();
    }

    public void DoReminders()
    {
        if (_reminderWindow is { IsLoaded: true })
        {
            _reminderWindow.Activate();
            return;
        }
        _reminderWindow = new ReminderWindow(_reminders, _settings);
        _reminderWindow.Show();
    }

    public void DoSettings()
    {
        if (_settingsWindow is { IsLoaded: true })
        {
            _settingsWindow.Activate();
            return;
        }
        _settingsWindow = new SettingsWindow(_settings, _store, _sound);
        _settingsWindow.Show();
    }

    public System.Collections.Generic.IReadOnlyList<TargetWindow> GetJumpTargets() =>
        _brain.AvailableWindows ?? _empty;

    public void JumpTo(TargetWindow target) => _brain.StartJumpTo(target);

    public void DoExit()
    {
        Persist();
        Application.Current.Shutdown();
    }

    // ------------------------------------------------------------------ misc

    private void ApplySize()
    {
        Width = SpriteRenderer.Box * _settings.SizeScale;
        Height = SpriteRenderer.Box * _settings.SizeScale + PadTop;
    }

    private void Persist()
    {
        _settings.Happiness = _brain.Happiness;
        _settings.Energy = _brain.Energy;
        _settings.Boredom = _brain.Boredom;
        _settings.Coins = _wallet.Balance;
        try { _store.Save(_settings); } catch (Exception) { /* disk issues must never kill the cat */ }
    }
}
