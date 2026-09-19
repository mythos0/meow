using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using MeowCat.Rendering;

namespace MeowCat.Windows;

/// <summary>FrameworkElement that paints one sprite frame of the cat (plus coin popups).</summary>
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
            SpriteRenderer.Render(dc, s);
            if (!string.IsNullOrWhiteSpace(s.SpeechText))
            {
                EmoteRenderer.RenderSpeechBubble(dc, s.SpeechText, s.SpeechMessage ?? "",
                    s.SpeechElapsed, s.CanvasW, s.ArtTop + 34 * s.Scale, s.Scale);
            }
            for (var i = CoinPopups.Count - 1; i >= 0; i--)
            {
                var (amount, elapsed) = CoinPopups[i];
                EmoteRenderer.RenderCoinPopup(dc, amount, elapsed, s.CanvasW * 0.52, s.CanvasH * 0.16);
            }
        }
        else
        {
            dc.DrawRectangle(Brushes.Transparent, null, new Rect(0, 0, ActualWidth, ActualHeight));
        }
    }
}
