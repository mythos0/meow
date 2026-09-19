using System;
using System.Collections.Concurrent;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MeowCat.Core;

namespace MeowCat.Rendering;

/// <summary>
/// Frame-based sprite renderer: draws the AI-generated photorealistic cat frames with a soft
/// contact shadow, optional accessories (SpriteFx) and floating emotes. All bitmaps are cached
/// and frozen — per-frame work is a single DrawImage plus overlays.
/// </summary>
public static class SpriteRenderer
{
    /// <summary>Art-box size in DIU at scale 1.0 (frames are 512x512 with feet at the bottom).</summary>
    public const double Box = 460;

    private static readonly ConcurrentDictionary<string, BitmapSource?> _cache = new();

    /// <summary>Load + freeze a frame bitmap (null when missing — renderer falls back gracefully).</summary>
    public static BitmapSource? LoadFrame(string relPath)
    {
        return _cache.GetOrAdd(relPath, key =>
        {
            try
            {
                var full = Path.Combine(AppContext.BaseDirectory, key.Replace('/', Path.DirectorySeparatorChar));
                if (!File.Exists(full)) return null;
                var bmp = new BitmapImage();
                bmp.BeginInit();
                bmp.CacheOption = BitmapCacheOption.OnLoad;
                bmp.UriSource = new Uri(full, UriKind.Absolute);
                bmp.DecodePixelWidth = 512;
                bmp.EndInit();
                bmp.Freeze();
                return bmp;
            }
            catch (Exception)
            {
                return null;
            }
        });
    }

    /// <summary>Clears the cache (used by tests and hot-reload scenarios).</summary>
    public static void ClearCache() => _cache.Clear();

    /// <summary>Registers real frame counts found on disk so clips with fewer frames loop cleanly.</summary>
    public static void PrimeCatalog()
    {
        foreach (var (breedId, clipName) in SpriteCatalog.AllRequiredAssets())
        {
            var n = 0;
            for (var i = 0; i < SpriteCatalog.MaxFramesPerClip; i++)
            {
                var rel = $"Assets/sprites/{breedId}/{clipName}/frame_{i:00}.png";
                var full = Path.Combine(AppContext.BaseDirectory, rel.Replace('/', Path.DirectorySeparatorChar));
                if (File.Exists(full)) n++; else break;
            }
            if (n > 0) SpriteCatalog.RegisterFrameCount(breedId, clipName, n);
        }
    }

    public static void Render(DrawingContext dc, RenderSpec spec)
    {
        var rc = SpriteCatalog.Resolve(spec.BreedId, spec.State);
        var clip = rc.Clip;
        var raw = spec.Time * clip.Fps;
        var frameIndex = (int)Math.Floor(raw);
        var frac = raw - frameIndex;                 // 0..1 between this frame and the next
        var rel = SpriteCatalog.FrameFile(rc, frameIndex);
        var bmp = LoadFrame(rel);

        // soft contact shadow on the ground (shrinks while airborne)
        var shadowK = Math.Clamp(1 - spec.AirHeight / 240.0, 0.25, 1.0);
        if (spec.State != CatState.Dragged)
        {
            var sw = 190 * shadowK * spec.Scale;
            var sh = 30 * shadowK * spec.Scale;
            var shadow = new EllipseGeometry(new Rect((spec.CanvasW - sw) / 2,
                spec.CanvasH - 16 * spec.Scale - sh / 2, sw, sh));
            dc.DrawGeometry(CatPalette.Frozen("#28000000"), null, shadow);
        }

        // the sprite itself, flipped for left-facing side-view clips
        var size = spec.CanvasH - spec.ArtTop;         // art box fills the square below the headroom
        var x = (spec.CanvasW - size) / 2;
        var y = spec.ArtTop;
        if (bmp is not null)
        {
            var flip = clip.View == SpriteView.Side && spec.Facing < 0;
            var rect = new Rect(x, y, size, size);
            var tg = new TransformGroup();
            tg.Children.Add(new ScaleTransform(flip ? -1 : 1, 1, spec.CanvasW / 2, 0));
            dc.PushTransform(tg);
            dc.DrawImage(bmp, rect);

            // cross-fade into the next frame: the two sprites blend during the tail
            // of each frame's slot, giving in-between poses without extra artwork.
            if (clip.Loop && frac > 0.45)
            {
                var nextBmp = LoadFrame(SpriteCatalog.FrameFile(rc, frameIndex + 1));
                if (nextBmp is not null)
                {
                    var blend = (frac - 0.45) / 0.55;              // eased ramp in the last 55%
                    blend = blend * blend * (3 - 2 * blend);       // smoothstep
                    dc.PushOpacity(blend * 0.85);                  // cap so the base stays visible
                    dc.DrawImage(nextBmp, rect);
                    dc.Pop();
                }
            }

            if (spec.Accessories is { Count: > 0 })
                SpriteFx.Render(dc, spec, clip.View, rect);   // rides inside the flip → sticks to the head
            dc.Pop();
        }

        // mood emotes float above the head
        var headCx = spec.CanvasW / 2 + (clip.View == SpriteView.Side ? spec.Facing * 52 * spec.Scale : 0);
        var headCy = spec.ArtTop + 26 * spec.Scale;
        if (spec.State == CatState.Angry || spec.State == CatState.ScratchAttack)
        {
            EmoteRenderer.Render(dc, "surprise", spec.Time, headCx, headCy, spec.Scale);
        }
        else if (spec.State == CatState.Sleeping)
        {
            EmoteRenderer.Render(dc, "zzz", spec.Time, headCx, headCy, spec.Scale);
        }
        else if (spec.State is CatState.Dancing)
        {
            EmoteRenderer.Render(dc, "music", spec.Time, headCx, headCy, spec.Scale);
        }
        else if (spec.State is CatState.Petted or CatState.FeedHappy)
        {
            EmoteRenderer.Render(dc, spec.EmotePack, spec.Time, headCx, headCy, spec.Scale);
        }
    }
}
