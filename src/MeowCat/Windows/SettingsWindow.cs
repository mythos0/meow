using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MeowCat.Core;
using MeowCat.Platform;
using MeowCat.Rendering;

namespace MeowCat.Windows;

/// <summary>
/// Settings: launch with Windows (auto-start), sound & volume, cat size, reminder popups.
/// Every change applies immediately and persists (corrupt-safe JSON store).
/// </summary>
public sealed class SettingsWindow : Window
{
    private readonly MeowSettings _settings;
    private readonly SettingsStore _store;
    private readonly SoundService _sound;
    private readonly CheckBox _autoStart = new() { Content = "Start MeowCat when Windows starts" };
    private readonly CheckBox _soundOn = new() { Content = "Sound effects" };
    private readonly CheckBox _popups = new() { Content = "Cat shows reminder messages on screen" };
    private readonly Slider _volume = new()
    {
        Minimum = 0, Maximum = 1, TickFrequency = 0.1,
        IsSnapToTickEnabled = true, Width = 240,
    };
    private readonly Slider _size = new()
    {
        Minimum = 0.5, Maximum = 2.0, TickFrequency = 0.1,
        IsSnapToTickEnabled = true, Width = 240,
    };
    private readonly TextBlock _status = new() { Text = " ", Margin = new Thickness(0, 10, 0, 0) };

    public SettingsWindow(MeowSettings settings, SettingsStore store, SoundService sound)
    {
        _settings = settings;
        _store = store;
        _sound = sound;

        Title = "Settings — MeowCat";
        Width = 470; Height = 460;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = CatPalette.Frozen("#FFF7F0E5");
        ResizeMode = ResizeMode.NoResize;

        var card = new Border
        {
            Background = Brushes.White,
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(18),
            Margin = new Thickness(14),
            VerticalAlignment = VerticalAlignment.Stretch,
            BorderBrush = CatPalette.Frozen("#22808080"),
            BorderThickness = new Thickness(1),
        };
        Content = card;
        var form = new StackPanel();
        card.Child = form;

        form.Children.Add(new TextBlock
        {
            Text = "⚙️ Settings",
            FontSize = 20,
            FontWeight = FontWeights.Bold,
            Foreground = CatPalette.Frozen("#FF5A4632"),
            Margin = new Thickness(0, 0, 0, 12),
        });

        // ---- auto start
        _autoStart.IsChecked = settings.AutoStartEnabled && AutoStart.IsEnabled();
        _autoStart.Checked += (_, _) => ApplyAutoStart(true);
        _autoStart.Unchecked += (_, _) => ApplyAutoStart(false);
        form.Children.Add(Section("startup", "Windows"));
        form.Children.Add(_autoStart);

        // ---- sound
        _soundOn.IsChecked = settings.SoundEnabled;
        _soundOn.Checked += (_, _) => ApplySound(true);
        _soundOn.Unchecked += (_, _) => ApplySound(false);
        form.Children.Add(Section("sound", "Sound"));
        form.Children.Add(_soundOn);
        form.Children.Add(FieldLabel("Volume"));
        _volume.Value = settings.Volume;
        _volume.ValueChanged += (_, _) =>
        {
            settings.Volume = _volume.Value;
            _sound.Volume = _volume.Value;
            Persist();
        };
        form.Children.Add(_volume);

        // ---- reminders
        form.Children.Add(Section("bell", "Reminders"));
        _popups.IsChecked = settings.ReminderPopupsEnabled;
        _popups.Checked += (_, _) => { settings.ReminderPopupsEnabled = true; Persist(); };
        _popups.Unchecked += (_, _) => { settings.ReminderPopupsEnabled = false; Persist(); };
        form.Children.Add(_popups);

        // ---- size
        form.Children.Add(Section("ruler", "Cat size"));
        _size.Value = settings.SizeScale;
        _size.ValueChanged += (_, _) =>
        {
            settings.SizeScale = Math.Clamp(_size.Value, 0.5, 2.0);
            Persist();
        };
        form.Children.Add(_size);

        _status.Foreground = CatPalette.Frozen("#FF4CAF7D");
        _status.FontWeight = FontWeights.SemiBold;
        form.Children.Add(_status);
    }

    private void ApplyAutoStart(bool on)
    {
        var ok = AutoStart.Set(on);
        _settings.AutoStartEnabled = ok && on;
        _status.Text = ok
            ? (on ? "MeowCat will start with Windows ✓" : "Auto-start disabled ✓")
            : "Could not change auto-start (registry blocked).";
        _status.Foreground = CatPalette.Frozen(ok ? "#FF4CAF7D" : "#FFB03A48");
        Persist();
    }

    private void ApplySound(bool on)
    {
        _settings.SoundEnabled = on;
        _sound.Enabled = on;
        Persist();
    }

    private void Persist()
    {
        try { _store.Save(_settings); }
        catch (Exception) { /* disk issues must never kill the cat */ }
    }

    private static TextBlock Section(string emoji, string title) => new()
    {
        Text = $"{emoji}  {title}",
        FontWeight = FontWeights.Bold,
        FontSize = 14,
        Foreground = CatPalette.Frozen("#FF5A4632"),
        Margin = new Thickness(0, 14, 0, 6),
    };

    private static TextBlock FieldLabel(string text) => new()
    {
        Text = text,
        Margin = new Thickness(0, 6, 0, 2),
        Foreground = CatPalette.Frozen("#FF7A6A55"),
        FontSize = 12,
    };
}
