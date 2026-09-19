using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using MeowCat.Core;
using MeowCat.Rendering;

namespace MeowCat.Windows;

/// <summary>
/// Reminders & timers: create/edit/delete reminders with full customization — time,
/// repetition, message and the movement the cat performs when notifying.
/// </summary>
public sealed class ReminderWindow : Window
{
    private readonly ReminderService _service;
    private readonly MeowSettings _settings;
    private readonly ListBox _list = new() { Margin = new Thickness(0, 8, 0, 8) };
    private readonly TextBox _title = new();
    private readonly TextBox _message = new() { AcceptsReturn = false };
    private readonly TextBox _timeText = new() { Text = "08:30" };
    private readonly ComboBox _repeat = new();
    private readonly ComboBox _movement = new();
    private readonly CheckBox _sound = new() { Content = "Play a meow", IsChecked = true };
    private readonly CheckBox _enabled = new() { Content = "Enabled", IsChecked = true };
    private readonly CheckBox _popups = new() { Content = "Cat shows the message", IsChecked = true };
    private readonly TextBlock _hint = new();
    private Reminder? _editing;

    public ReminderWindow(ReminderService service, MeowSettings settings)
    {
        _service = service;
        _settings = settings;

        Title = "Reminders & Timers — MeowCat";
        Width = 760; Height = 520;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = CatPalette.Frozen("#FFF7F0E5");
        ResizeMode = ResizeMode.NoResize;

        var root = new Grid { Margin = new Thickness(14) };
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(12) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(330) });
        Content = root;

        // ---- left: the list
        var left = new Grid { RowDefinitions = { new RowDefinition { Height = GridLength.Auto }, new RowDefinition(), new RowDefinition { Height = GridLength.Auto } } };
        left.Children.Add(new TextBlock
        {
            Text = "⏰ Your reminders",
            FontSize = 19,
            FontWeight = FontWeights.Bold,
            Foreground = CatPalette.Frozen("#FF5A4632"),
        });
        Grid.SetRow(_list, 1);
        _list.Background = Brushes.White;
        _list.BorderThickness = new Thickness(1);
        _list.BorderBrush = CatPalette.Frozen("#33808080");
        _list.SelectionChanged += (_, _) => LoadSelected();
        left.Children.Add(_list);

        var delRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
        delRow.Children.Add(MkButton("Delete selected", DeleteSelected, "#FFE0566B"));
        left.Children.Add(delRow);
        Grid.SetRow(delRow, 2);
        root.Children.Add(left);

        // ---- right: the editor
        var card = new Border
        {
            Background = Brushes.White,
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(14),
            BorderBrush = CatPalette.Frozen("#22808080"),
            BorderThickness = new Thickness(1),
        };
        var form = new StackPanel();
        card.Child = form;
        Grid.SetColumn(card, 2);
        root.Children.Add(card);

        form.Children.Add(new TextBlock
        {
            Text = "New reminder",
            FontSize = 16,
            FontWeight = FontWeights.Bold,
            Foreground = CatPalette.Frozen("#FF5A4632"),
            Margin = new Thickness(0, 0, 0, 8),
        });

        form.Children.Add(FieldLabel("Title"));
        form.Children.Add(_title);

        form.Children.Add(FieldLabel("Message the cat will show"));
        form.Children.Add(_message);

        form.Children.Add(FieldLabel("Time (HH:mm, 24-hour)"));
        form.Children.Add(_timeText);

        form.Children.Add(FieldLabel("Repeat"));
        foreach (var r in new[] { ReminderRepeat.Once, ReminderRepeat.Daily, ReminderRepeat.Weekly,
                 ReminderRepeat.Every30Minutes, ReminderRepeat.EveryHour })
            _repeat.Items.Add(new ComboBoxItem { Content = Reminder.RepeatLabel(r), Tag = r });
        _repeat.SelectedIndex = 0;
        form.Children.Add(_repeat);

        form.Children.Add(FieldLabel("Cat movement when notifying"));
        foreach (var m in Reminder.Movements)
            _movement.Items.Add(new ComboBoxItem { Content = PrettyMovement(m), Tag = m });
        _movement.SelectedIndex = 0;
        form.Children.Add(_movement);

        var checks = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 8, 0, 0) };
        checks.Children.Add(_sound);
        checks.Children.Add(_enabled);
        form.Children.Add(checks);

        var checks2 = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 0) };
        checks2.Children.Add(_popups);
        form.Children.Add(checks2);

        _hint.Text = " ";
        _hint.Foreground = CatPalette.Frozen("#FFB03A48");
        _hint.FontWeight = FontWeights.SemiBold;
        _hint.TextWrapping = TextWrapping.Wrap;
        form.Children.Add(_hint);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 10, 0, 0) };
        buttons.Children.Add(MkButton("Add / Save", Save, "#FF4CAF7D"));
        buttons.Children.Add(MkButton("Preview movement", Preview, "#FF5B9BD5"));
        form.Children.Add(buttons);

        _popups.Checked += (_, _) => { _settings.ReminderPopupsEnabled = true; };
        _popups.Unchecked += (_, _) => { _settings.ReminderPopupsEnabled = false; };

        Reload();
    }

    private void Reload()
    {
        _list.Items.Clear();
        foreach (var r in _service.Reminders.OrderByDescending(r => r.Enabled).ThenBy(r => r.Time))
        {
            var when = r.Repeat == ReminderRepeat.Once
                ? r.Time.ToString("ddd dd MMM HH:mm")
                : $"{r.Time:HH:mm} · {Reminder.RepeatLabel(r.Repeat)}";
            var item = new ListBoxItem
            {
                Tag = r,
                Content = new TextBlock
                {
                    Inlines =
                    {
                        new System.Windows.Documents.Bold(new System.Windows.Documents.Run(
                            (r.Enabled ? "🔔 " : "🔕 ") + r.Title)),
                        new System.Windows.Documents.Run($"\n{when} · {PrettyMovement(r.Movement)}"),
                    },
                },
                Padding = new Thickness(8, 5, 8, 5),
            };
            _list.Items.Add(item);
        }
    }

    private void LoadSelected()
    {
        if (_list.SelectedItem is ListBoxItem { Tag: Reminder r })
        {
            _editing = r;
            _title.Text = r.Title;
            _message.Text = r.Message;
            _timeText.Text = r.Time.ToString("HH:mm");
            _repeat.SelectedIndex = (int)r.Repeat;
            var idx = Array.IndexOf(Reminder.Movements, r.Movement);
            _movement.SelectedIndex = idx < 0 ? 0 : idx;
            _sound.IsChecked = r.SoundOn;
            _enabled.IsChecked = r.Enabled;
        }
    }

    private void Save()
    {
        _hint.Text = " ";
        var title = _title.Text.Trim();
        if (title.Length == 0)
        {
            _hint.Text = "Please give the reminder a title.";
            return;
        }
        if (!TimeSpan.TryParse(_timeText.Text.Trim(), out var time))
        {
            _hint.Text = "Time must look like 08:30 or 17:45 (24-hour).";
            return;
        }

        var repeat = _repeat.SelectedItem is ComboBoxItem { Tag: ReminderRepeat rr } ? rr : ReminderRepeat.Once;
        var movement = _movement.SelectedItem is ComboBoxItem { Tag: string mv } ? mv : Reminder.Movements[0];

        var now = DateTime.Now;
        var when = new DateTime(now.Year, now.Month, now.Day, time.Hours, time.Minutes, 0);
        if (when <= now && repeat == ReminderRepeat.Once) when = when.AddDays(1);

        try
        {
            if (_editing is not null)
            {
                _editing.Title = title;
                _editing.Message = _message.Text.Trim();
                _editing.Time = when;
                _editing.Repeat = repeat;
                _editing.Movement = movement;
                _editing.SoundOn = _sound.IsChecked == true;
                _editing.Enabled = _enabled.IsChecked == true;
                _editing.FiredOnce = false;
                _service.Update(_editing);
                _editing = null;
            }
            else
            {
                _service.Add(new Reminder
                {
                    Title = title,
                    Message = _message.Text.Trim(),
                    Time = when,
                    Repeat = repeat,
                    Movement = movement,
                    SoundOn = _sound.IsChecked == true,
                    Enabled = _enabled.IsChecked == true,
                });
            }
        }
        catch (Exception ex)
        {
            _hint.Text = "Could not save: " + ex.Message;
            return;
        }

        _title.Text = "";
        _message.Text = "";
        Reload();
    }

    private void DeleteSelected()
    {
        if (_list.SelectedItem is ListBoxItem { Tag: Reminder r })
        {
            _service.Remove(r.Id);
            _editing = null;
            Reload();
        }
    }

    private void Preview()
    {
        var movement = _movement.SelectedItem is ComboBoxItem { Tag: string mv } ? mv : Reminder.Movements[0];
        _hint.Text = $"The cat will {PrettyMovement(movement).ToLowerInvariant()} when this reminder fires.";
    }

    private static string PrettyMovement(string m) => m switch
    {
        nameof(CatState.Dancing) => "Dance 💃",
        nameof(CatState.Jumping) => "Jump around",
        nameof(CatState.PlayingYarn) => "Play with yarn",
        nameof(CatState.Scratching) => "Scratch happily",
        nameof(CatState.Running) => "Run zoomies",
        nameof(CatState.Walking) => "Walk proudly",
        nameof(CatState.Sitting) => "Sit and wave",
        nameof(CatState.ChasingCursor) => "Chase the cursor",
        _ => m,
    };

    private static TextBlock FieldLabel(string text) => new()
    {
        Text = text,
        Margin = new Thickness(0, 8, 0, 2),
        Foreground = CatPalette.Frozen("#FF7A6A55"),
        FontSize = 12,
    };

    private static Button MkButton(string text, Action onClick, string color)
    {
        var b = new Button
        {
            Content = text,
            Padding = new Thickness(12, 6, 12, 6),
            Margin = new Thickness(0, 0, 8, 0),
            Background = CatPalette.Frozen(color),
            Foreground = Brushes.White,
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold,
            Cursor = System.Windows.Input.Cursors.Hand,
        };
        b.Click += (_, _) => onClick();
        return b;
    }
}
