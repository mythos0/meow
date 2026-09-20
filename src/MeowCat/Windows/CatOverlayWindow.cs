// CatOverlayWindow.cs — full-workarea transparent overlay hosting the cat.
// Port of the Electron cat.html host logic:
//   • click-through unless the cursor is over the cat (WS_EX_TRANSPARENT toggle)
//   • drag to move / drop onto window tops, tap = pet (+2 coins, purr)
//   • double-click opens Settings, right-click opens the context menu
//   • walk/run/scratch footstep sounds, topmost enforcement, reminders bubble

namespace MeowCat.Windows;

using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using MeowCat.Core.Brain;
using MeowCat.Platform;

public sealed class CatOverlayWindow : Window
{
    private readonly CatElement _cat = new();
    private readonly DispatcherTimer _timer = new();
    private readonly SoundService _sound;
    private readonly Action _openSettings;

    public CatBrain Brain { get; }

    private bool _overCat;
    private bool _dragging;
    private double _dragDx, _dragDy;
    private double _downX, _downY;
    private DispatcherTimer? _petPending;
    private int _lastStepPhase = -1;
    private DispatcherTimer? _topmostTimer;

    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, int flags);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }

    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int SWP_NOMOVE = 0x0002, SWP_NOSIZE = 0x0001, SWP_NOACTIVATE = 0x0010;
    private static readonly IntPtr HwndTopmost = new(-1);

    public CatOverlayWindow(CatBrain brain, SoundService sound, Action openSettings)
    {
        Brain = brain;
        _sound = sound;
        _openSettings = openSettings;

        AllowsTransparency = true;
        WindowStyle = WindowStyle.None;
        Background = System.Windows.Media.Brushes.Transparent;
        ShowInTaskbar = false;
        ShowActivated = false;
        ResizeMode = ResizeMode.NoResize;
        Topmost = true;
        Content = _cat;
        Title = "MeowCat";

        var (wx, wy, ww, wh) = ScreenInfo.WorkArea;
        Left = wx; Top = wy; Width = ww; Height = wh;

        Loaded += (_, _) =>
        {
            ApplyClickThrough(true);
            StartTopmostLoop();
        };

        _timer.Interval = TimeSpan.FromMilliseconds(33);   // 30 fps — smooth yet frugal
        _timer.Tick += Tick;
        _timer.Start();

        MouseDown += OnMouseDown;
        MouseMove += OnMouseMove;
        MouseUp += OnMouseUp;
        MouseDoubleClick += OnDblClick;
        MouseRightButtonUp += OnRightClick;
    }

    public void ApplyView(double scale, double alpha, double speed, string breed)
    {
        _cat.SetScale(scale);
        _cat.SetAlpha(alpha);
        Brain.Speed = speed;
        Brain.Breed = breed;
    }

    // ------------------------------------------------------------ frame loop
    private void Tick(object? s, EventArgs e)
    {
        // dt from real time so hibernation/hibernation recovery is smooth
        Brain.Tick(1 / 30.0);
        StepSounds();

        // click-through: poll the cursor (cheap native call, 30/s)
        if (GetCursorPos(out var pt))
        {
            var rel = PointFromScreenPx(pt.X, pt.Y);
            bool hit = _dragging || _cat.HitTest(rel.X, rel.Y);
            if (hit != _overCat)
            {
                _overCat = hit;
                ApplyClickThrough(!hit);
            }
        }
        _cat.InvalidateVisual();
    }

    private Point PointFromScreenPx(int screenX, int screenY)
    {
        // physical px → window-local DIU
        double scale = ScreenInfo.Scale;
        double diuX = screenX / scale;
        double diuY = screenY / scale;
        return new Point(diuX - Left, diuY - Top);
    }

    private void StepSounds()
    {
        if (Brain.State == "walk")
        {
            int ph = (int)Math.Floor(Brain.T * 7 * 2);
            if (ph != _lastStepPhase) { _lastStepPhase = ph; _sound.Play("patter.wav", 0.12); }
        }
        else if (Brain.State == "run")
        {
            int ph = (int)Math.Floor(Brain.T * 12.5 * 2);
            if (ph != _lastStepPhase) { _lastStepPhase = ph; _sound.Play("run_patter.wav", 0.15); }
        }
        else if (Brain.State == "scratch")
        {
            int ph = (int)Math.Floor(Brain.T * 10.5);
            if (ph != _lastStepPhase) { _lastStepPhase = ph; _sound.Play("scratch.wav", 0.35); }
        }
        else _lastStepPhase = -1;
    }

    // ------------------------------------------------------------ input
    private void OnMouseDown(object sender, MouseButtonEventArgs e)
    {
        var p = e.GetPosition(this);
        if (!_cat.HitTest(p.X, p.Y) || e.ChangedButton != MouseButton.Left) return;

        _downX = p.X; _downY = p.Y;
        _dragDx = p.X - Brain.X;
        _dragDy = p.Y - Brain.BaseY;
        _dragging = true;
        CaptureMouse();

        // no sound here: the purr only plays when a quick tap confirms as a pet
        _petPending?.Stop();
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(280) };
        _petPending = t;
        t.Tick += (_, _) =>
        {
            t.Stop();
            _petPending = null;
            Brain.Pet();          // brain fires the love emote
            _sound.Play("purr_real.wav", 0.9);
            PetConfirmed?.Invoke();
        };
        t.Start();
    }

    public event Action? PetConfirmed;

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (!_dragging) return;
        var p = e.GetPosition(this);
        double moved = Math.Abs(p.X - _downX) + Math.Abs(p.Y - _downY);
        if (moved > 6 && _petPending != null) { _petPending.Stop(); _petPending = null; } // it's a drag
        Brain.X = Math.Max(Brain.MinX + 60, Math.Min(Brain.MaxX - 60, p.X - _dragDx));
        Brain.BaseY = Math.Max(Brain.BoundsY + 120, Math.Min(Brain.BoundsY + Brain.BoundsH - 8, p.Y - _dragDy));
        Brain.JumpY = 0;
    }

    private void OnMouseUp(object sender, MouseButtonEventArgs e)
    {
        if (!_dragging) return;
        Brain.DropAt(Brain.X, Brain.BaseY); // snap to a window top or the ground
        _dragging = false;
        ReleaseMouseCapture();
    }

    private void OnDblClick(object sender, MouseButtonEventArgs e)
    {
        var p = e.GetPosition(this);
        if (!_cat.HitTest(p.X, p.Y)) return;
        _petPending?.Stop(); _petPending = null;
        _dragging = false;
        _openSettings();   // v3.1: double-click opens the Settings popup
    }

    private void OnRightClick(object sender, MouseButtonEventArgs e)
    {
        var p = e.GetPosition(this);
        if (!_cat.HitTest(p.X, p.Y)) return;
        var menu = new ContextMenu();

        var miSettings = new MenuItem { Header = "⚙ Settings…" };
        miSettings.Click += (_, _) => _openSettings();
        var miReminders = new MenuItem { Header = "⏰ Reminders…" };
        miReminders.Click += (_, _) => OpenReminders?.Invoke();
        var miDance = new MenuItem { Header = "💃 Dance!" };
        miDance.Click += (_, _) => { Brain.Dance(); _sound.Play("dance_loop.wav", 0.5); };
        var miFeed = new MenuItem { Header = "🍖 Feed" };
        miFeed.Click += (_, _) => Brain.Feed();
        var miSleep = new MenuItem { Header = "💤 Sleep now" };
        miSleep.Click += (_, _) => Brain.SleepNow();

        menu.Items.Add(miSettings);
        menu.Items.Add(miReminders);
        menu.Items.Add(new Separator());
        menu.Items.Add(miDance);
        menu.Items.Add(miFeed);
        menu.Items.Add(miSleep);
        menu.Items.Add(new Separator());
        var miQuit = new MenuItem { Header = "Quit MeowCat" };
        miQuit.Click += (_, _) => QuitRequested?.Invoke();
        menu.Items.Add(miQuit);

        menu.Placement = System.Windows.Controls.Primitives.PlacementMode.MousePoint;
        menu.IsOpen = true;
    }

    public event Action? QuitRequested;
    public event Action? OpenReminders;

    // ------------------------------------------------------------ reminders
    public void FireReminder(string label)
    {
        Brain.Dance();
        _cat.BubbleText = "⏰ " + label;
        _cat.BubbleUntil = DateTime.UtcNow.AddSeconds(8);
        _sound.Play("chirp.wav", 0.8);
    }

    public void DoAction(string act)
    {
        switch (act)
        {
            case "sleep": Brain.SleepNow(); break;
            case "eat": Brain.Feed(); break;
            case "dance": Brain.Dance(); _sound.Play("dance_loop.wav", 0.5); break;
            case "happy": Brain.Pet(); break;
            case "jump": Brain.Poke(); break;
        }
    }

    // ------------------------------------------------------------ win32
    private void ApplyClickThrough(bool transparent)
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (hwnd == IntPtr.Zero) return;
            int style = GetWindowLong(hwnd, GWL_EXSTYLE);
            SetWindowLong(hwnd, GWL_EXSTYLE, transparent ? style | WS_EX_TRANSPARENT : style & ~WS_EX_TRANSPARENT);
        }
        catch { /* window may be closing */ }
    }

    private void StartTopmostLoop()
    {
        _topmostTimer?.Stop();
        _topmostTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _topmostTimer.Tick += (_, _) =>
        {
            try
            {
                var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
                if (hwnd != IntPtr.Zero)
                    SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
            catch { /* gone */ }
        };
        _topmostTimer.Start();
    }

    protected override void OnClosed(EventArgs e)
    {
        _timer.Stop();
        _topmostTimer?.Stop();
        base.OnClosed(e);
    }
}
