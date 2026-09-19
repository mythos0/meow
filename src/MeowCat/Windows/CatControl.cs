using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using MeowCat.Rendering;

namespace MeowCat.Windows;

/// <summary>FrameworkElement that paints one frame of the cat (plus coin popups).</summary>
public sealed class CatControl : FrameworkElement
{
    public static readonly DependencyProperty SpecProperty = DependencyProperty.Register(
        nameof(Spec), typeof(RenderSpec), typeof(CatControl),
        new FrameworkPropertyMetadata(null, FrameworkPropertyMetadataOptions.AffectsRender));

    public RenderSpec? Spec
    {
        get => (RenderSpec?)GetValue(SpecProperty);
        set => SetValue(SpecProperty, value);
    }

    /// <summary>Active "+N coin" popups: (amount, elapsed seconds).</summary>
    public List<(int Amount, double Elapsed)> CoinPopups { get; } = new();

    protected override void OnRender(DrawingContext dc)
    {
        if (Spec is { } s)
        {
            CatRenderer.Render(dc, s);
            for (var i = CoinPopups.Count - 1; i >= 0; i--)
            {
                var (amount, elapsed) = CoinPopups[i];
                EmoteRenderer.RenderCoinPopup(dc, amount, elapsed, 118 * s.Scale, 34 * s.Scale);
            }
        }
        else
        {
            dc.DrawRectangle(Brushes.Transparent, null, new Rect(0, 0, ActualWidth, ActualHeight));
        }

        // generous invisible hit area so petting/dragging feels reliable
        var s2 = Spec?.Scale ?? 1.0;
        dc.DrawRectangle(CatPalette.Frozen("#03000000"), null,
            new Rect(55 * s2, 16 * s2, 110 * s2, 150 * s2));
    }
}
