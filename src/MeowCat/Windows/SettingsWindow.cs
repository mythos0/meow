// SettingsWindow.cs — the MeowCat settings popup (port of settings.html).
// Cat Store with live procedural previews, size/opacity/speed sliders,
// Reminders & Timers editor, Behaviour toggles, About card. Dark theme.

namespace MeowCat.Windows;

using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using MeowCat.Core.Data;
using MeowCat.Core.Render;
using MeowCat.Core.Store;
using MeowCat.Rendering;

public sealed class SettingsWindow : Window
{
    private readonly SettingsStore _store;
    private readonly Func<long> _coinsGetter;
    private readonly Action<string> _onBreedChanged;
    private readonly Action _onSoundChanged;
    private readonly Action _onAutoStartChanged;
    private readonly Action _onTopmostChanged;
    private readonly Action _onViewChanged;
    private readonly Func<List<ReminderItem>> _listReminders;
    private readonly Func<ReminderItem, bool> _addReminder;
    private readonly Func<string, bool> _removeReminder;
    private readonly Action _requestClose;      // app decides hide-vs-quit

    private TextBlock _toast = null!;
    private DispatcherTimer? _toastTimer;
    private TextBlock _coinsPill = null!;
    private TextBlock _shopHint = null!;
    private WrapPanel _breeds = null!;
    private Slider _size = null!, _opacity = null!, _speed = null!;
    private TextBlock _sizeV = null!, _opV = null!, _spV = null!;
    private CheckBox _sounds = null!, _topmost = null!, _autoStart = null!;
    private TextBox _remLabel = null!;
    private System.Windows.Forms.DateTimePicker _remWhen = null!;
    private ComboBox _remRepeat = null!, _remAnim = null!;
    private CheckBox _remSound = null!;
    private StackPanel _remList = null!;
    private Section _remindersSection = null!;

    private System.Windows.Forms.Integration.WindowsFormsHost? _dtHost;

    public SettingsWindow(
        SettingsStore store,
        Func<long> coinsGetter,
        Action<string> onBreedChanged,
        Action onSoundChanged, Action onAutoStartChanged, Action onTopmostChanged,
        Action onViewChanged,
        Func<List<ReminderItem>> listReminders,
        Func<ReminderItem, bool> addReminder,
        Func<string, bool> removeReminder,
        Action requestClose)
    {
        _store = store;
        _coinsGetter = coinsGetter;
        _onBreedChanged = onBreedChanged;
        _onSoundChanged = onSoundChanged;
        _onAutoStartChanged = onAutoStartChanged;
        _onTopmostChanged = onTopmostChanged;
        _onViewChanged = onViewChanged;
        _listReminders = listReminders;
        _addReminder = addReminder;
        _removeReminder = removeReminder;
        _requestClose = requestClose;

        Title = "MeowCat Settings";
        Width = 560;
        MinHeight = 640;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Brush("#15161c");
        Icon = TryLoadIcon();

        Content = BuildUi();
        Loaded += (_, _) => { SyncControls(); RenderBreeds(); RenderReminders(); };
        Closed += (_, _) => DetachDtHost();
    }

    // ---------------------------------------------------------------- UI kit
    private sealed class Section : StackPanel
    {
        public string Header
        {
            set
            {
                Children.Insert(0, new TextBlock
                {
                    Text = value,
                    FontSize = 15,
                    FontWeight = FontWeights.Bold,
                    Foreground = Brush("#e8eaf0"),
                    Margin = new Thickness(0, 18, 0, 6),
                });
            }
        }
    }

    private static SolidColorBrush Brush(string hex)
    {
        var b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        b.Freeze();
        return b;
    }

    private static Border Card(double marginV = 8)
    {
        return new Border
        {
            Background = Brush("#1d1f27"),
            BorderBrush = Brush("#2c2f3a"),
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = new Thickness(14),
            Margin = new Thickness(0, 0, 0, marginV),
        };
    }

    private static TextBlock Hint(string text) => new()
    {
        Text = text,
        FontSize = 11.5,
        Foreground = Brush("#8b90a0"),
        TextWrapping = TextWrapping.Wrap,
    };

    private static Button Btn(string text, bool ghost = false)
    {
        var b = new Button
        {
            Content = text,
            Padding = new Thickness(12, 6, 12, 6),
            Cursor = Cursors.Hand,
            Background = ghost ? Brush("#23252e") : Brush("#4f6ef7"),
            Foreground = ghost ? Brush("#cfd3e0") : Brushes.White,
            BorderThickness = new Thickness(0),
        };
        return b;
    }

    // ---------------------------------------------------------------- build
    private UIElement BuildUi()
    {
        var root = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Padding = new Thickness(18),
        };
        var stack = new StackPanel();

        stack.Children.Add(new TextBlock
        {
            Text = "🐱 MeowCat Settings",
            FontSize = 20,
            FontWeight = FontWeights.Bold,
            Foreground = Brush("#ffffff"),
        });
        stack.Children.Add(Hint("Changes apply instantly."));

        // ---------------- Cat Store ----------------
        stack.Children.Add(new TextBlock
        {
            Text = "Cat Store",
            FontSize = 15, FontWeight = FontWeights.Bold,
            Foreground = Brush("#e8eaf0"), Margin = new Thickness(0, 18, 0, 6),
        });
        var storeCard = Card();
        var storeHead = new Grid { ColumnDefinitions = { new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }, new ColumnDefinition { Width = GridLength.Auto } } };
        storeHead.Children.Add(new TextBlock { Text = "Choose your companion", Foreground = Brush("#cfd3e0"), VerticalAlignment = VerticalAlignment.Center });
        _coinsPill = new TextBlock { Text = "🪙 0", Foreground = Brush("#ffd75e"), FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(_coinsPill, 1);
        storeHead.Children.Add(_coinsPill);
        storeCard.Child = new StackPanel
        {
            Children =
            {
                storeHead,
                new TextBlock { Margin = new Thickness(0, 4, 0, 0) },
            },
        };
        var storeStack = (StackPanel)storeCard.Child;
        _shopHint = Hint("");
        storeStack.Children.Add(_shopHint);
        _breeds = new WrapPanel { Margin = new Thickness(0, 10, 0, 0) };
        storeStack.Children.Add(_breeds);
        stack.Children.Add(storeCard);

        // ---------------- sliders ----------------
        var sliders = Card();
        var sl = new StackPanel { Margin = new Thickness(0) };
        _size = AddSlider(sl, "Size", 0.5, 2.0, 0.05, out _sizeV, v => $"{Math.Round(v * 100)}%");
        _opacity = AddSlider(sl, "Opacity", 0.3, 1.0, 0.05, out _opV, v => $"{Math.Round(v * 100)}%");
        _speed = AddSlider(sl, "Walk speed", 20, 140, 5, out _spV, v => $"{v:0} px/s");
        sliders.Child = sl;
        stack.Children.Add(sliders);

        _size.ValueChanged += (_, _) => { _sizeV.Text = $"{Math.Round(_size.Value * 100)}%"; _onSetting("Size", _size.Value); };
        _opacity.ValueChanged += (_, _) => { _opV.Text = $"{Math.Round(_opacity.Value * 100)}%"; _onSetting("Opacity", _opacity.Value); };
        _speed.ValueChanged += (_, _) => { _spV.Text = $"{_speed.Value:0} px/s"; _onSetting("Speed", _speed.Value); };

        // ---------------- Reminders ----------------
        _remindersSection = new Section { Header = "⏰ Reminders & Timers" };
        _remindersSection.Children.Add(Hint("When a reminder fires, your cat dances and shows the message."));

        var remCard = Card();
        var remStack = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        _remLabel = new TextBox { Margin = new Thickness(0, 0, 0, 8), Padding = new Thickness(6, 4, 6, 4) };
        remStack.Children.Add(Row("Message", _remLabel));

        _remWhen = new System.Windows.Forms.DateTimePicker
        {
            Format = System.Windows.Forms.DateTimePickerFormat.Custom,
            CustomFormat = "yyyy-MM-dd HH:mm",
            ShowUpDown = true,
            Width = 160,
        };
        _dtHost = new System.Windows.Forms.Integration.WindowsFormsHost { Child = _remWhen, Margin = new Thickness(0, 0, 0, 8) };
        remStack.Children.Add(Row("When", _dtHost));

        _remRepeat = new ComboBox { MinWidth = 160, Margin = new Thickness(0, 0, 0, 8) };
        foreach (var (v, label) in new[] { ("once", "Once"), ("hourly", "Every hour"), ("daily", "Every day"), ("weekly", "Every week") })
            _remRepeat.Items.Add(new ComboItem(v, label));
        _remRepeat.SelectedIndex = 0;
        remStack.Children.Add(Row("Repeat", _remRepeat));

        _remAnim = new ComboBox { MinWidth = 160, Margin = new Thickness(0, 0, 0, 8) };
        foreach (var (v, label) in new[] { ("dance", "Dance 💃"), ("happy", "Happy bounce 💗"), ("jump", "Jump 🐾"), ("eat", "Snack 🐟"), ("sleep", "Sleep 😴") })
            _remAnim.Items.Add(new ComboItem(v, label));
        _remAnim.SelectedIndex = 0;
        remStack.Children.Add(Row("Cat does", _remAnim));

        _remSound = new CheckBox { Content = "Play a meow", IsChecked = true, Foreground = Brush("#cfd3e0"), Margin = new Thickness(0, 0, 0, 8) };
        var addRow = new DockPanel();
        DockPanel.SetDock(_remSound, Dock.Left);
        var addBtn = Btn("Add reminder");
        addBtn.Click += (_, _) => AddReminderFromUi();
        DockPanel.SetDock(addBtn, Dock.Right);
        addRow.Children.Add(_remSound);
        addRow.Children.Add(new FrameworkElement()); // spacer not needed; fill
        addRow.Children.Add(addBtn);
        remStack.Children.Add(addRow);

        remCard.Child = remStack;
        _remindersSection.Children.Add(remCard);

        _remList = new StackPanel();
        var listCard = Card();
        listCard.Child = _remList;
        _remindersSection.Children.Add(listCard);
        stack.Children.Add(_remindersSection);

        // ---------------- Behaviour ----------------
        stack.Children.Add(new TextBlock
        {
            Text = "Behaviour",
            FontSize = 15, FontWeight = FontWeights.Bold,
            Foreground = Brush("#e8eaf0"), Margin = new Thickness(0, 18, 0, 6),
        });
        var beh = Card();
        var bs = new StackPanel();
        _sounds = Check("Sound effects");
        _sounds.Checked += (_, _) => _onSettingFlag("sounds", true);
        _sounds.Unchecked += (_, _) => _onSettingFlag("sounds", false);
        _topmost = Check("Stay on top of fullscreen apps (recommended)");
        _topmost.Checked += (_, _) => { _onSettingFlag("topmost", true); _onTopmostChanged(); };
        _topmost.Unchecked += (_, _) => { _onSettingFlag("topmost", false); _onTopmostChanged(); };
        _autoStart = Check("Start with Windows");
        _autoStart.Checked += (_, _) => { _onSettingFlag("autoStart", true); _onAutoStartChanged(); };
        _autoStart.Unchecked += (_, _) => { _onSettingFlag("autoStart", false); _onAutoStartChanged(); };
        bs.Children.Add(_sounds); bs.Children.Add(_topmost); bs.Children.Add(_autoStart);
        beh.Child = bs;
        stack.Children.Add(beh);

        // ---------------- About ----------------
        stack.Children.Add(new TextBlock
        {
            Text = "About",
            FontSize = 15, FontWeight = FontWeights.Bold,
            Foreground = Brush("#e8eaf0"), Margin = new Thickness(0, 18, 0, 6),
        });
        var about = Card();
        var ab = new StackPanel();
        ab.Children.Add(new TextBlock
        {
            Text = $"MeowCat v{VersionText} — C# WPF edition",
            FontSize = 13.5, FontWeight = FontWeights.SemiBold, Foreground = Brush("#ffffff"),
        });
        ab.Children.Add(Hint("A procedurally animated desktop cat — every frame is drawn by code, no sprite frames. One process, tiny memory footprint (no Electron, no Chromium)."));
        var links = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 8, 0, 0) };
        var lnkDev = Chip("👨‍💻 Developer — github.com/mythos0", "https://github.com/mythos0");
        var lnkRepo = Chip("🐾 Source & releases", "https://github.com/mythos0/meow");
        links.Children.Add(lnkDev);
        links.Children.Add(lnkRepo);
        ab.Children.Add(links);
        ab.Children.Add(Hint("WPF renderer · 21 breeds · 20 actions · 11 emotes\nSounds recorded from real cats. MIT License © 2026 mythos0."));
        about.Child = ab;
        stack.Children.Add(about);

        // ---------------- footer ----------------
        var footer = new DockPanel { Margin = new Thickness(0, 14, 0, 10) };
        var gotoRem = Btn("⏰ Reminders…", ghost: true);
        gotoRem.Click += (_, _) => FocusReminders();
        DockPanel.SetDock(gotoRem, Dock.Left);
        var close = Btn("Close", ghost: true);
        close.Click += (_, _) => _requestClose();
        DockPanel.SetDock(close, Dock.Right);
        footer.Children.Add(gotoRem);
        footer.Children.Add(close);
        stack.Children.Add(footer);

        _toast = new TextBlock
        {
            Foreground = Brush("#7fe0a8"),
            FontWeight = FontWeights.SemiBold,
            Visibility = Visibility.Collapsed,
            Margin = new Thickness(0, 2, 0, 10),
        };
        stack.Children.Add(_toast);

        root.Content = stack;
        return root;
    }

    public static string VersionText => "4.0.0";

    private sealed record ComboItem(string Value, string Label)
    {
        public override string ToString() => Label;
    }

    private static UIElement Row(string label, UIElement control)
    {
        var g = new Grid
        {
            ColumnDefinitions =
            {
                new ColumnDefinition { Width = new GridLength(90) },
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) },
            },
        };
        var l = new TextBlock { Text = label, Foreground = Brush("#aeb3c2"), VerticalAlignment = VerticalAlignment.Center };
        g.Children.Add(l);
        Grid.SetColumn(control, 1);
        g.Children.Add(control);
        return g;
    }

    private Slider AddSlider(StackPanel parent, string label, double min, double max, double step, out TextBlock valueText, Func<double, string> fmt)
    {
        var g = new Grid { Margin = new Thickness(0, 4, 0, 4) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(70) });
        g.Children.Add(new TextBlock { Text = label, Foreground = Brush("#aeb3c2"), VerticalAlignment = VerticalAlignment.Center });
        var s = new Slider { Minimum = min, Maximum = max, SmallChange = step, LargeChange = step * 4, TickFrequency = step, IsSnapToTickEnabled = false, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(s, 1);
        g.Children.Add(s);
        valueText = new TextBlock { Foreground = Brush("#8b90a0"), VerticalAlignment = VerticalAlignment.Center, Text = fmt(min) };
        Grid.SetColumn(valueText, 2);
        g.Children.Add(valueText);
        parent.Children.Add(g);
        return s;
    }

    private static CheckBox Check(string label) => new()
    {
        Content = label,
        Foreground = Brush("#cfd3e0"),
        Margin = new Thickness(0, 4, 0, 4),
        Cursor = Cursors.Hand,
    };

    private Button Chip(string label, string url)
    {
        var b = Btn(label, ghost: true);
        b.Margin = new Thickness(0, 0, 8, 0);
        b.Click += (_, _) =>
        {
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { /* blocked */ }
        };
        return b;
    }

    private void Toast(string msg, bool ok = true)
    {
        _toast.Text = msg;
        _toast.Foreground = Brush(ok ? "#7fe0a8" : "#f0776c");
        _toast.Visibility = Visibility.Visible;
        _toastTimer?.Stop();
        _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.2) };
        _toastTimer.Tick += (_, _) => { _toastTimer?.Stop(); _toast.Visibility = Visibility.Collapsed; };
        _toastTimer.Start();
    }

    private void _onSetting(string key, double value)
    {
        switch (key)
        {
            case "Size": _store.Set(d => d.Size = value); break;
            case "Opacity": _store.Set(d => d.Opacity = value); break;
            case "Speed": _store.Set(d => d.Speed = value); break;
        }
        _onViewChanged();
    }

    private void _onSettingFlag(string key, bool v)
    {
        switch (key)
        {
            case "sounds": _store.Set(d => d.Sounds = v); _onSoundChanged(); break;
            case "topmost": _store.Set(d => d.Topmost = v); break;
            case "autoStart": _store.Set(d => d.AutoStart = v); break;
        }
    }

    // ---------------------------------------------------------------- store grid
    private static readonly HashSet<string> NewBreeds = new()
    {
        "bombay", "russian_blue", "ginger_kitten", "ragdoll", "bengal", "maine_coon", "panda",
        "mochi", "scottish_fold", "snow_angora", "somali", "british_plush", "choco_munchkin", "sakura",
        "lucky_tabby",
    };

    private void RenderBreeds()
    {
        var data = _store.All;
        _breeds.Children.Clear();
        foreach (var (breed, pal) in Catalog.Palettes)
        {
            bool owned = data.Owned.Contains(breed) || data.UnlimitedCoins;
            bool selected = data.Breed == breed;

            var card = new Border
            {
                Width = 128,
                Margin = new Thickness(4),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(6),
                Cursor = Cursors.Hand,
                Background = selected ? Brush("#2a3352") : Brush("#23252e"),
                BorderBrush = selected ? Brush("#5f7df7") : Brush("#2c2f3a"),
                BorderThickness = new Thickness(1),
                Tag = breed,
            };
            var cs = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            var preview = new Image { Width = 112, Height = 72 };
            cs.Children.Add(preview);
            cs.Children.Add(new TextBlock
            {
                Text = pal.Name,
                FontSize = 11,
                Foreground = Brush("#e8eaf0"),
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(0, 2, 0, 0),
            });
            if (!owned)
            {
                cs.Children.Add(new TextBlock
                {
                    Text = "🔒 " + (Catalog.BreedPrices.TryGetValue(breed, out var pr) ? pr.ToString() : "?") + " 🪙",
                    FontSize = 10.5,
                    Foreground = Brush("#ffd75e"),
                    TextAlignment = TextAlignment.Center,
                });
            }
            else if (selected)
            {
                cs.Children.Add(new TextBlock
                {
                    Text = "✓",
                    FontSize = 11,
                    Foreground = Brush("#7fe0a8"),
                    TextAlignment = TextAlignment.Center,
                });
            }
            if (NewBreeds.Contains(breed))
            {
                var tag = new TextBlock
                {
                    Text = breed == "panda" ? "🐼 new" : "new",
                    FontSize = 9.5,
                    Foreground = Brush("#ffd75e"),
                    TextAlignment = TextAlignment.Center,
                };
                cs.Children.Add(tag);
            }
            card.Child = cs;

            var b = breed;
            card.MouseLeftButtonUp += (_, _) => SelectBreed(b, owned);
            _breeds.Children.Add(card);
            Preview(breed, preview);
        }
    }

    private void SelectBreed(string breed, bool owned)
    {
        if (!owned)
        {
            var r = _store.BuyBreed(breed);
            if (r.Ok) { Toast("Unlocked " + breed + "!"); SyncControls(); RenderBreeds(); }
            else Toast("Need " + r.Needed + " more 🪙", false);
            return;
        }
        if (!_store.All.Owned.Contains(breed))
        {
            var r = _store.BuyBreed(breed);
            if (!r.Ok) return;
        }
        _store.Set(d => d.Breed = breed);
        _onBreedChanged(breed);
        RenderBreeds();
    }

    // ---------------------------------------------------------------- previews
    private void Preview(string breed, Image target)
    {
        try
        {
            const double dpr = 1.5;
            int w = (int)(150 * dpr), h = (int)(96 * dpr);
            var pal = Catalog.PaletteOf(breed);
            double k = Catalog.BodyOf(pal).Preview;

            var dv = new DrawingVisual();
            using (var dc = dv.RenderOpen())
            {
                dc.PushTransform(new TranslateTransform(w / 2.0, h - 10 * dpr));
                var canvas = new MeowCat.Core.Render.Canvas();
                CatArt.DrawCat(canvas, breed, "sit", 0.15, 1, k, 1, 0.5);
                var replay = new WpfReplay();
                replay.Replay(canvas.Ops, dc);
                dc.Pop();
            }
            var rtb = new RenderTargetBitmap(w, h, 96 * dpr, 96 * dpr, PixelFormats.Pbgra32);
            rtb.Render(dv);
            rtb.Freeze();
            target.Source = rtb;
        }
        catch { /* preview optional */ }
    }

    // ---------------------------------------------------------------- reminders
    private void RenderReminders()
    {
        _remList.Children.Clear();
        var items = _listReminders();
        if (items.Count == 0)
        {
            _remList.Children.Add(Hint("No reminders yet."));
            return;
        }
        foreach (var it in items)
        {
            var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
            var del = Btn("✕", ghost: true);
            del.Padding = new Thickness(6, 2, 6, 2);
            var id = it.Id;
            del.Click += (_, _) => { _removeReminder(id); RenderReminders(); };
            DockPanel.SetDock(del, Dock.Right);

            string rep = it.Repeat switch
            {
                "hourly" => " · hourly", "daily" => " · daily", "weekly" => " · weekly", _ => "",
            };
            var txt = new TextBlock
            {
                Text = $"{FmtWhen(it.At)}  —  {it.Label}{rep}",
                Foreground = Brush("#cfd3e0"),
                VerticalAlignment = VerticalAlignment.Center,
                TextTrimming = TextTrimming.CharacterEllipsis,
            };
            row.Children.Add(txt);
            row.Children.Add(del);
            _remList.Children.Add(row);
        }
    }

    private static string FmtWhen(long ms)
    {
        var d = DateTimeOffset.FromUnixTimeMilliseconds(ms).ToLocalTime();
        return d.ToString("MMM d, HH:mm");
    }

    private void AddReminderFromUi()
    {
        string label = string.IsNullOrWhiteSpace(_remLabel.Text) ? "Reminder" : _remLabel.Text.Trim();
        var whenLocal = _remWhen.Value;
        if (whenLocal == default)
        {
            Toast("Pick a date & time first", false);
            return;
        }
        long at = new DateTimeOffset(whenLocal, TimeZoneInfo.Local.GetUtcOffset(whenLocal)).ToUnixTimeMilliseconds();
        if (at <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 60000)
        {
            Toast("That time is in the past", false);
            return;
        }
        var item = new ReminderItem
        {
            Label = label,
            At = at,
            Repeat = ((ComboItem)_remRepeat.SelectedItem!).Value,
            Anim = ((ComboItem)_remAnim.SelectedItem!).Value,
            Sound = _remSound.IsChecked == true,
        };
        _addReminder(item);
        _remLabel.Text = "";
        Toast("Reminder added — your cat is on it! 🐾");
        RenderReminders();
    }

    private void FocusReminders()
    {
        try
        {
            _remindersSection.BringIntoView();
        }
        catch { }
    }

    // ---------------------------------------------------------------- sync
    public void SyncControls()
    {
        var d = _store.All;
        _size.Value = d.Size;
        _opacity.Value = d.Opacity;
        _speed.Value = d.Speed;
        _sizeV.Text = $"{Math.Round(d.Size * 100)}%";
        _opV.Text = $"{Math.Round(d.Opacity * 100)}%";
        _spV.Text = $"{d.Speed:0} px/s";
        _sounds.IsChecked = d.Sounds;
        _topmost.IsChecked = d.Topmost;
        _autoStart.IsChecked = d.AutoStart;
        _coinsPill.Text = "🪙 " + _coinsGetter();
        _shopHint.Text = d.UnlimitedCoins
            ? "🎁 Unlimited-coins promo — every breed unlocks free!"
            : "Earn 1 🪙 every 30s · +2 🪙 every pet tap";
    }

    public void FocusRemindersExternal() => FocusReminders();

    private void DetachDtHost()
    {
        try { _dtHost?.Child?.Dispose(); _dtHost?.Dispose(); } catch { }
        _dtHost = null;
    }

    private static ImageSource? TryLoadIcon()
    {
        try
        {
            string p = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
            if (System.IO.File.Exists(p))
            {
                var img = new BitmapImage();
                img.BeginInit();
                img.UriSource = new Uri(p);
                img.EndInit();
                img.Freeze();
                return img;
            }
        }
        catch { }
        return null;
    }
}
