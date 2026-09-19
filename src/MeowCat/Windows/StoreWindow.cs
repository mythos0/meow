using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using MeowCat.Core;
using MeowCat.Rendering;

namespace MeowCat.Windows;

/// <summary>
/// The Cat Store: breeds, accessories, emote packs and size — every card shows a live-rendered
/// preview of the actual cat, and the right pane animates the full pending look before applying.
/// </summary>
public sealed class StoreWindow : Window
{
    private readonly MeowSettings _settings;
    private readonly SettingsStore _store;
    private readonly CoinWallet _wallet;
    private readonly CatControl _preview = new();
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(33) };
    private readonly Border _balanceChip;
    private readonly TextBlock _hint = new();
    private readonly Button _apply = new();
    private readonly Slider _size = new();

    private string _pendingBreed;
    private string _pendingEmote;
    private List<string> _pendingAccs;
    private double _previewTime;
    private double _emoteShowcase;
    private double _hintTimer;

    /// <summary>Called after the user applies changes so the live cat updates immediately.</summary>
    public Action? OnApplied { get; init; }

    public StoreWindow(MeowSettings settings, SettingsStore store, CoinWallet wallet)
    {
        _settings = settings;
        _store = store;
        _wallet = wallet;
        _pendingBreed = settings.BreedId;
        _pendingEmote = settings.EmotePackId;
        _pendingAccs = new List<string>(settings.Accessories);

        Title = "Cat Store — MeowCat";
        Width = 780; Height = 580;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = CatPalette.Frozen("#FFF7F0E5");
        ResizeMode = ResizeMode.NoResize;

        var root = new Grid { Margin = new Thickness(14) };
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(268) });

        // ---- top bar
        var top = new Grid();
        var title = new TextBlock
        {
            Text = "🐱 Cat Store",
            FontSize = 22,
            FontWeight = FontWeights.Bold,
            Foreground = CatPalette.Frozen("#FF5A4632"),
        };
        _balanceChip = BalanceChip();
        top.Children.Add(title);
        top.Children.Add(_balanceChip);
        Grid.SetRow(top, 0);
        Grid.SetColumnSpan(top, 2);
        root.Children.Add(top);

        // ---- left: category tabs + cards
        var left = new Grid { Margin = new Thickness(0, 10, 10, 0) };
        left.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        left.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        var tabs = new TabControl
        {
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            FontSize = 14,
        };
        tabs.Items.Add(MakeTab("Breeds", BuildBreedCards));
        tabs.Items.Add(MakeTab("Accessories", BuildAccessoryCards));
        tabs.Items.Add(MakeTab("Emotes", BuildEmoteCards));
        Grid.SetRow(tabs, 0);
        left.Children.Add(tabs);

        _hint.Text = " ";
        _hint.Foreground = CatPalette.Frozen("#FFB03A48");
        _hint.FontWeight = FontWeights.SemiBold;
        Grid.SetRow(_hint, 1);
        Grid.SetRow(_hint, 2);
        left.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        Grid.SetRow(_hint, 2);
        left.Children.Add(_hint);
        root.Children.Add(left);
        Grid.SetColumn(left, 0);
        Grid.SetRow(left, 1);

        // ---- right: preview + size + apply
        var right = new Border
        {
            Background = Brushes.White,
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(12),
            Margin = new Thickness(0, 10, 0, 0),
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            { BlurRadius = 14, ShadowDepth = 2, Opacity = 0.18 },
        };
        var rv = new StackPanel();
        rv.Children.Add(new TextBlock
        {
            Text = "Live preview",
            FontWeight = FontWeights.Bold,
            FontSize = 15,
            Foreground = CatPalette.Frozen("#FF5A4632"),
            Margin = new Thickness(4, 0, 0, 4),
        });
        var previewHost = new Border
        {
            Background = CatPalette.Frozen("#FFFDF6EA"),
            CornerRadius = new CornerRadius(10),
            Height = 300,
            Child = _preview,
        };
        rv.Children.Add(previewHost);

        rv.Children.Add(new TextBlock
        {
            Text = "Size",
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(4, 10, 0, 2),
        });
        _size.Minimum = 0.5; _size.Maximum = 2.0;
        _size.Value = _settings.SizeScale;
        _size.TickFrequency = 0.1;
        _size.IsSnapToTickEnabled = false;
        _size.ValueChanged += (_, _) => { };
        rv.Children.Add(_size);

        _apply.Content = "Apply to my cat";
        _apply.Height = 38;
        _apply.Margin = new Thickness(0, 10, 0, 0);
        _apply.FontSize = 14;
        _apply.FontWeight = FontWeights.Bold;
        _apply.Background = CatPalette.Frozen("#FFF08A5D");
        _apply.Foreground = Brushes.White;
        _apply.BorderThickness = new Thickness(0);
        _apply.Click += (_, _) => Apply();
        rv.Children.Add(_apply);

        var gift = new Button
        {
            Content = "Daily gift: +50 coins",
            Height = 32,
            Margin = new Thickness(0, 8, 0, 0),
            Background = CatPalette.Frozen("#FFFFD54F"),
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.SemiBold,
        };
        gift.Click += (_, _) => ClaimDailyGift();
        rv.Children.Add(gift);

        right.Child = rv;
        root.Children.Add(right);
        Grid.SetColumn(right, 1);
        Grid.SetRow(right, 1);

        Content = root;
        _wallet.Changed += _ => RefreshBalance();
        RefreshBalance();

        _timer.Tick += (_, _) => PreviewFrame();
        Loaded += (_, _) => _timer.Start();
        Closed += (_, _) => { _timer.Stop(); _wallet.Changed -= _ => RefreshBalance(); };
    }

    // ------------------------------------------------------------------ preview

    private void PreviewFrame()
    {
        var dt = 0.033;
        _previewTime += dt;
        if (_emoteShowcase > 0) _emoteShowcase -= dt;
        if (_hintTimer > 0) { _hintTimer -= dt; if (_hintTimer <= 0) _hint.Text = " "; }

        var state = _emoteShowcase > 0 ? CatState.Petted : CatState.Walking;
        _preview.Spec = new RenderSpec
        {
            State = state,
            Time = _previewTime,
            Facing = 1,
            Scale = Math.Clamp(_size.Value * 0.92, 0.45, 1.9),
            BreedId = _pendingBreed,
            Breed = (SkinCatalog.Breed(_pendingBreed) ?? SkinCatalog.Breeds[0]).Colors,
            Accessories = _pendingAccs,
            EmotePack = _pendingEmote,
        };
        _preview.InvalidateVisual();
    }

    private void RefreshBalance()
    {
        _balanceChip.Child = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Children =
            {
                new System.Windows.Shapes.Ellipse
                { Width = 15, Height = 15, Fill = CatPalette.Frozen("#FFF2C94C"), Stroke = CatPalette.Frozen("#FFB98A1F"), StrokeThickness = 1.5, Margin = new Thickness(0, 0, 6, 0) },
                new TextBlock
                { Text = _wallet.Balance.ToString(), FontWeight = FontWeights.Bold, FontSize = 16, VerticalAlignment = System.Windows.VerticalAlignment.Center, Foreground = CatPalette.Frozen("#FF5A4632") },
            },
        };
    }

    private Border BalanceChip() => new()
    {
        Background = Brushes.White,
        CornerRadius = new CornerRadius(14),
        Padding = new Thickness(12, 5, 12, 5),
        HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
        VerticalAlignment = System.Windows.VerticalAlignment.Top,
        Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 8, Opacity = 0.15, ShadowDepth = 1 },
    };

    private void ShowHint(string msg)
    {
        _hint.Text = msg;
        _hintTimer = 2.5;
    }

    // ------------------------------------------------------------------ tabs & cards

    private static TabItem MakeTab(string header, Func<UIElement> content)
        => new() { Header = header, Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = content() } };

    private UIElement BuildBreedCards()
    {
        var panel = new WrapPanel { Margin = new Thickness(4) };
        foreach (var b in SkinCatalog.Breeds)
        {
            var breed = b;
            panel.Children.Add(MakeCard(
                breed.Name, breed.Price, _settings.OwnedItems.Contains(breed.Id),
                breed.Id == _pendingBreed,
                breed.Colors, spec => { spec.BreedId = breed.Id; spec.Breed = breed.Colors; },
                () => SelectBreed(breed)));
        }
        return panel;
    }

    private UIElement BuildAccessoryCards()
    {
        var panel = new WrapPanel { Margin = new Thickness(4) };
        foreach (var a in SkinCatalog.Accessories)
        {
            var acc = a;
            var selected = _pendingAccs.Contains(acc.Id);
            var card = MakeCard(
                acc.Name, acc.Price, _settings.OwnedItems.Contains(acc.Id),
                selected,
                null, spec => { spec.Accessories = new List<string>(_pendingAccs) { acc.Id }; },
                () => ToggleAccessory(acc));
            card.Tag = acc.Id;
            panel.Children.Add(card);
        }
        return panel;
    }

    private UIElement BuildEmoteCards()
    {
        var panel = new WrapPanel { Margin = new Thickness(4) };
        foreach (var e in SkinCatalog.EmotePacks)
        {
            var pack = e;
            panel.Children.Add(MakeCard(
                pack.Name, pack.Price, _settings.OwnedItems.Contains(pack.Id),
                pack.Id == _pendingEmote,
                null, spec => { spec.EmotePack = pack.Id; spec.State = CatState.Petted; },
                () => SelectEmote(pack)));
        }
        return panel;
    }

    private Border MakeCard(string name, int price, bool owned, bool selected,
        BreedColors? breed, Action<RenderSpec> decorate, Action onClick)
    {
        var card = new Border
        {
            Width = 138, Height = 178,
            Margin = new Thickness(5),
            CornerRadius = new CornerRadius(10),
            Background = Brushes.White,
            BorderThickness = new Thickness(selected ? 2.5 : 1),
            BorderBrush = selected ? CatPalette.Frozen("#FFF08A5D") : CatPalette.Frozen("#FFE4D6C3"),
            Cursor = System.Windows.Input.Cursors.Hand,
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 6, Opacity = 0.12, ShadowDepth = 1 },
        };

        var stack = new StackPanel();
        var mini = new CatControl { Width = 128, Height = 118 };
        var spec = new RenderSpec
        {
            State = CatState.Sitting, Time = 0.4, Facing = 1,
            Scale = 0.55,
            BreedId = breed is null ? _pendingBreed : name, // placeholder, replaced below
            Breed = breed ?? (SkinCatalog.Breed(_pendingBreed) ?? SkinCatalog.Breeds[0]).Colors,
            Accessories = _pendingAccs,
            EmotePack = _pendingEmote,
        };
        decorate(spec);
        mini.Spec = spec;
        stack.Children.Add(mini);

        stack.Children.Add(new TextBlock
        {
            Text = name,
            FontWeight = FontWeights.SemiBold,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Center,
            Foreground = CatPalette.Frozen("#FF5A4632"),
        });

        var btn = new Button
        {
            Height = 24, Width = 96, Margin = new Thickness(0, 3, 0, 6),
            FontSize = 11.5,
            Background = owned ? CatPalette.Frozen("#FFB7D3B0") : CatPalette.Frozen("#FFF2C94C"),
            BorderThickness = new Thickness(0),
            FontWeight = FontWeights.Bold,
            Foreground = CatPalette.Frozen("#FF4A3B2A"),
        };
        UpdateCardButton(btn, owned, price);
        btn.Click += (_, _) =>
        {
            onClick();
            RefreshAllCards();
        };
        stack.Children.Add(btn);
        card.Child = stack;
        card.MouseDown += (_, _) =>
        {
            onClick();
            RefreshAllCards();
        };
        return card;
    }

    private static void UpdateCardButton(Button btn, bool owned, int price)
        => btn.Content = owned ? "Owned ✓" : $"Buy · {price} coins";

    /// <summary>Rebuilds the whole tab content so selection/buy states stay honest.</summary>
    private void RefreshAllCards()
    {
        var tv = FindNameScopeTabControl();
        if (tv is null) return;
        var idx = tv.SelectedIndex;
        var sv = (ScrollViewer)tv.SelectedContent!;
        sv.Content = idx switch
        {
            0 => BuildBreedCards(),
            1 => BuildAccessoryCards(),
            _ => BuildEmoteCards(),
        };
        tv.SelectedIndex = idx;
    }

    private TabControl? FindNameScopeTabControl()
    {
        if (Content is Grid g && g.Children.Count > 1 && g.Children[1] is Grid left)
            foreach (var child in left.Children)
                if (child is TabControl tc) return tc;
        return null;
    }

    // ------------------------------------------------------------------ actions

    private void SelectBreed(BreedDef breed)
    {
        if (!_settings.OwnedItems.Contains(breed.Id) && !TryBuy(breed.Id, breed.Price, breed.Name)) return;
        _pendingBreed = breed.Id;
    }

    private void SelectEmote(EmotePackDef pack)
    {
        if (!_settings.OwnedItems.Contains(pack.Id) && !TryBuy(pack.Id, pack.Price, pack.Name)) return;
        _pendingEmote = pack.Id;
        _emoteShowcase = 2.6;   // show the new emotes in the preview pane
    }

    private void ToggleAccessory(AccessoryDef acc)
    {
        if (!_settings.OwnedItems.Contains(acc.Id) && !TryBuy(acc.Id, acc.Price, acc.Name)) return;
        if (!_pendingAccs.Remove(acc.Id))
        {
            if (_pendingAccs.Count >= SkinCatalog.MaxAccessories)
            {
                ShowHint($"Up to {SkinCatalog.MaxAccessories} accessories at once — remove one first.");
                return;
            }
            _pendingAccs.Add(acc.Id);
        }
    }

    private bool TryBuy(string id, int price, string name)
    {
        if (!_wallet.TrySpend(price, "store:" + id))
        {
            ShowHint($"Not enough coins for {name} ({price} needed). Pet and play with your cat to earn more!");
            return false;
        }
        _settings.OwnedItems.Add(id);
        Persist();
        RefreshBalance();
        ShowHint($"{name} purchased — it's yours forever!");
        return true;
    }

    private void Apply()
    {
        _settings.BreedId = _pendingBreed;
        _settings.EmotePackId = _pendingEmote;
        _settings.Accessories = new List<string>(_pendingAccs);
        _settings.SizeScale = Math.Clamp(_size.Value, 0.5, 2.0);
        Persist();
        OnApplied?.Invoke();
        ShowHint("Applied! Your cat looks fabulous.");
    }

    private void ClaimDailyGift()
    {
        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd");
        if (_settings.LastDailyBonusUtc == today)
        {
            ShowHint("Daily gift already claimed today — come back tomorrow!");
            return;
        }
        _settings.LastDailyBonusUtc = today;
        _wallet.Earn(CoinWallet.DailyBonus, "daily");
        Persist();
        RefreshBalance();
        ShowHint($"+{CoinWallet.DailyBonus} coins! See you tomorrow.");
    }

    private void Persist()
    {
        try { _store.Save(_settings); } catch (Exception) { /* ignore disk errors */ }
    }
}
