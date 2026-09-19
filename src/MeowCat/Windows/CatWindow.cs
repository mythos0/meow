using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using MeowCat.Core;
using MeowCat.Platform;
using MeowCat.Rendering;
using FormsCursor = System.Windows.Forms.Cursor;

namespace MeowCat.Windows;

/// <summary>
/// The always-on-top transparent overlay that carries the cat across the entire screen.
/// Sized exactly to the cat (so the rest of the desktop stays fully clickable), driven by a
/// 60 FPS DispatcherTimer: brain tick → model physics → render spec → paint.
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

    private StoreWindow? _storeWindow;
    private TrayService? _tray;
    private DateTime _lastMouseMove = DateTime.MinValue;
    private (double X, double Y) _lastMouse;
    private double _loopSoundTimer;
    private bool _dragging;
    private Point _dragStartRelative;
    private DateTime _lastClick = DateTime.MinValue;
    private IReadOnlyList<TargetWindow> _empty = Array.Empty<TargetWindow>();

    public CatWindow(MeowSettings settings, SettingsStore store, CoinWallet wallet, SoundService sound)
    {
        _settings = settings;
        _store = store;
        _wallet = wallet;
        _sound = sound;
        _brain = new CatBrain(_model, _wallet);

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
        _wallet.Changed += amount => _cat.CoinPopups.Add((amount, 0));

        _cat.MouseLeftButtonDown += OnCatMouseDown;
        _cat.MouseMove += OnCatMouseMove;
        _cat.MouseLeftButtonUp += OnCatMouseUp;
        _cat.ContextMenuOpening += (_, _) => _cat.ContextMenu = MenuBuilder.Build(this);

        Loaded += (_, _) =>
        {
            var wa = ScreenInfo.WorkArea;
            _model.X = wa.X + wa.W * 0.72;
            _model.Y = wa.Y + wa.H;
            _timer.Tick += (_, _) => Frame();
            _timer.Start();
            _scanTimer.Tick += (_, _) => ScanWindows();
            _scanTimer.Start();
            _saveTimer.Tick += (_, _) => Persist();
            _saveTimer.Start();
            try
            {
                _tray = new TrayService(this, System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico"));
            }
            catch (Exception) { /* tray optional */ }
        };
        Closed += (_, _) => { _tray?.Dispose(); Persist(); };
    }

    // ------------------------------------------------------------------ frame

    private void Frame()
    {
        var dt = 0.016;

        // environment
        var wa = ScreenInfo.WorkArea;
        _model.SetBounds(wa.X + 30, wa.X + wa.W - 30);
        var floorY = wa.Y + wa.H;

        var mp = FormsCursor.Position;
        var mx = ScreenInfo.PxToDiu(mp.X);
        var my = ScreenInfo.PxToDiu(mp.Y);
        var moved = Math.Abs(mx - _lastMouse.X) + Math.Abs(my - _lastMouse.Y) > 4;
        if (moved) _lastMouseMove = DateTime.UtcNow;
        _lastMouse = (mx, my);

        if (!_dragging && _brain.State != CatState.Jumping && _brain.State != CatState.Dragged)
            _model.Y = floorY;

        _brain.Tick(dt, new BrainEnvironment
        {
            ScreenWidth = wa.W,
            ScreenHeight = wa.H,
            FloorY = floorY,
            MouseX = mx,
            MouseY = my,
            MouseRecentlyMoved = (DateTime.UtcNow - _lastMouseMove).TotalSeconds < 1.5,
            Windows = _brain.AvailableWindows ?? _empty,
        });

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

        // position window under the model
        if (!_dragging)
        {
            Left = _model.X - Width / 2;
            Top = _model.Y - CatRenderer.FeetY * _settings.SizeScale;
        }

        // paint
        var jump = _model.Jump;
        _cat.Spec = new RenderSpec
        {
            State = _brain.State,
            Time = _brain.StateTime,
            Facing = _model.Facing,
            Scale = _settings.SizeScale,
            BreedId = _settings.BreedId,
            Breed = (SkinCatalog.Breed(_settings.BreedId) ?? SkinCatalog.Breeds[0]).Colors,
            Accessories = _settings.Accessories,
            EmotePack = _settings.EmotePackId,
            AirHeight = Math.Max(0, floorY - _model.Y),
            JumpPhase = _model.JumpProgress,
            Vy = jump is { } j ? j.VelocityY(_model.JumpProgress) : 0,
        };
        _cat.InvalidateVisual();
    }

    private void ScanWindows()
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var list = new System.Collections.Generic.List<TargetWindow>();
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
        var entry = SoundCatalog.EntryFor(newS);
        if (entry is not null) _sound.Play(entry);
        if (oldS == CatState.Jumping) _sound.Play(SoundCatalog.Land);
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
        _model.Y = Top + CatRenderer.FeetY * _settings.SizeScale;
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
        // a click = pet the cat; two quick clicks = meow
        var now = DateTime.UtcNow;
        var dbl = (now - _lastClick).TotalMilliseconds < 350;
        _lastClick = now;
        _brain.TryPet();
        if (dbl) _sound.Play(SoundCatalog.Meow);
    }

    // ------------------------------------------------------------- ICatCommandHost

    public void DoFeed() { if (_brain.RequestFeed()) _sound.Play(SoundCatalog.Chirp); }
    public void DoDance() => _brain.RequestState(CatState.Dancing);
    public void DoSleep() => _brain.RequestState(CatState.Sleeping);
    public void DoPlay() => _brain.RequestState(CatState.PlayingYarn);
    public bool SoundOn => _sound.Enabled;
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
        Width = CatRenderer.CanvasW * _settings.SizeScale;
        Height = CatRenderer.CanvasH * _settings.SizeScale;
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
