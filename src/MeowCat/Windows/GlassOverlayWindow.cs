using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using MeowCat.Core;

namespace MeowCat.Windows;

/// <summary>
/// The full-virtual-screen overlay that renders the "broken screen" while the cat is angry.
/// Other windows stay fully visible (and clickable) underneath: the window is transparent,
/// topmost and click-through (WS_EX_TRANSPARENT), so it is a purely visual glass layer.
/// Every angry scratch attack stamps cracks at the swipe point; when the cat calms down the
/// whole layer fades away and is emptied.
/// </summary>
public sealed class GlassOverlayWindow : Window
{
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_LAYERED = 0x00080000;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hwnd, int index, int newStyle);

    private readonly Canvas _canvas = new();
    private readonly Dictionary<string, BitmapSource?> _bmp = new();
    private bool _calming;

    public GlassOverlayWindow()
    {
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        Focusable = false;
        IsHitTestVisible = false;
        Title = "MeowCat Glass";
        Content = _canvas;
        UseLayoutRounding = true;

        // cover the entire virtual screen (all monitors)
        Left = SystemParameters.VirtualScreenLeft;
        Top = SystemParameters.VirtualScreenTop;
        Width = SystemParameters.VirtualScreenWidth;
        Height = SystemParameters.VirtualScreenHeight;
    }

    // ------------------------------------------------------------------ decals

    /// <summary>Stamps one batch of cracks from a scratch attack. (x, y) = swipe point in
    /// virtual-screen DIU coordinates.</summary>
    public void AddScratches(double x, double y, IReadOnlyList<DecalSpec> decals, double glassScale = 1.0)
    {
        if (_calming) return;
        foreach (var d in decals)
        {
            var bmp = GetDecal(d.Asset);
            if (bmp is null) continue;

            var size = DecalSpec.ArtSize * d.Scale * glassScale;
            var img = new System.Windows.Controls.Image
            {
                Source = bmp,
                Width = size,
                Height = size * bmp.PixelHeight / bmp.PixelWidth,
                Stretch = Stretch.Uniform,
                IsHitTestVisible = false,
                Effect = new DropShadowEffect
                {
                    BlurRadius = 10,
                    ShadowDepth = 2,
                    Opacity = 0.55,
                    Direction = 315,
                },
            };
            RotateTransform rot = new(d.RotationDeg, size / 2, img.Height / 2);
            img.RenderTransform = rot;
            img.CacheMode = new BitmapCache();          // static decal: cache the raster

            Canvas.SetLeft(img, d.CenterX - size / 2 - SystemParameters.VirtualScreenLeft);
            Canvas.SetTop(img, d.CenterY - img.Height / 2 - SystemParameters.VirtualScreenTop);
            _canvas.Children.Add(img);

            // pop-in: quick scale+fade like an instant impact
            img.Opacity = 0;
            var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(130)) { FillBehavior = FillBehavior.HoldEnd };
            img.BeginAnimation(OpacityProperty, fade);
        }
        TrimOverflow();
    }

    /// <summary>Fades every crack away (the cat calmed down) and clears the layer.</summary>
    public void CalmDown()
    {
        _calming = true;
        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(1400))
        {
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut },
        };
        fade.Completed += (_, _) =>
        {
            _canvas.Children.Clear();
            _canvas.Opacity = 1;
            _calming = false;
            Hide();
        };
        _canvas.BeginAnimation(OpacityProperty, fade);
    }

    /// <summary>Instant clear (app shutdown).</summary>
    public void ClearNow()
    {
        _canvas.Children.Clear();
        _canvas.Opacity = 1;
        _calming = false;
        Hide();
    }

    public int DecalCount => _canvas.Children.Count;

    /// <summary>Native handle (0 before the source is initialized) — used for topmost enforcement.</summary>
    public IntPtr WindowHandle { get; private set; }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        WindowHandle = new WindowInteropHelper(this).Handle;
        var hwnd = WindowHandle;
        var style = GetWindowLong(hwnd, GWL_EXSTYLE);
        SetWindowLong(hwnd, GWL_EXSTYLE, style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
    }

    private void TrimOverflow()
    {
        while (_canvas.Children.Count > DecalPlanner.MaxDecals)
            _canvas.Children.RemoveAt(0);
    }

    private BitmapSource? GetDecal(string asset)
    {
        if (_bmp.TryGetValue(asset, out var cached)) return cached;
        try
        {
            var full = Path.Combine(AppContext.BaseDirectory, "Assets", "sprites", "_fx", asset);
            if (!File.Exists(full))
            {
                _bmp[asset] = null;
                return null;
            }
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(full, UriKind.Absolute);
            bmp.EndInit();
            bmp.Freeze();
            _bmp[asset] = bmp;
            return bmp;
        }
        catch (Exception)
        {
            _bmp[asset] = null;
            return null;
        }
    }
}
