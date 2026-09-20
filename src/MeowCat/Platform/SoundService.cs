using System;
using System.Collections.Generic;
using System.IO;
using System.Media;
using System.Windows.Media;

namespace MeowCat.Platform;

/// <summary>
/// Plays the synthesized SFX pack via WPF MediaPlayer (async, volume-controlled, with a short
/// per-sound cooldown to avoid audio spam). Silent no-op off Windows.
/// </summary>
public sealed class SoundService
{
    private readonly Dictionary<string, MediaPlayer> _players = new();
    private readonly Dictionary<string, DateTime> _lastPlay = new();
    private readonly object _gate = new();

    public bool Enabled { get; set; } = true;
    public double Volume { get; set; } = 0.6;
    public string BaseDir { get; }

    public SoundService(string? baseDirOverride = null)
    {
        BaseDir = baseDirOverride ?? Path.Combine(AppContext.BaseDirectory, "Assets", "sounds");
    }

    public bool FileExists(string name) => File.Exists(Path.Combine(BaseDir, name));

    public void Play(string name, double? volumeOverride = null)
    {
        if (!Enabled || !OperatingSystem.IsWindows() || string.IsNullOrEmpty(name)) return;
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            if ((now - _lastPlay.GetValueOrDefault(name, DateTime.MinValue)).TotalMilliseconds < 120) return;
            _lastPlay[name] = now;
            try
            {
                if (!_players.TryGetValue(name, out var p))
                {
                    p = new MediaPlayer();
                    _players[name] = p;
                }
                p.Volume = Math.Clamp(volumeOverride ?? Volume, 0, 1);
                if (_uris.TryGetValue(name, out var u)) p.Position = TimeSpan.Zero;
                else
                {
                    u = new Uri(Path.Combine(BaseDir, name));
                    _uris[name] = u;
                    p.Open(u);
                }
                p.Play();
            }
            catch (Exception) { /* never crash the cat over audio */ }
        }
    }

    private readonly Dictionary<string, Uri> _uris = new();

    public void SetVolume(double v)
    {
        Volume = Math.Clamp(v, 0, 1);
        lock (_gate)
            foreach (var p in _players.Values)
                p.Volume = Volume;
    }
}
