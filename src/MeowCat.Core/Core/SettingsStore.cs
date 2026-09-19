using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MeowCat.Core;

/// <summary>All persisted cat state (economy, wardrobe, mood, preferences).</summary>
public sealed class MeowSettings
{
    public int Version { get; set; } = 2;
    public string CatName { get; set; } = "Mochi";
    public int Coins { get; set; } = CoinWallet.StartBalance;
    public string BreedId { get; set; } = "grey_tabby";
    public List<string> Accessories { get; set; } = new();
    public string EmotePackId { get; set; } = "hearts";
    public double SizeScale { get; set; } = 1.0;
    public bool SoundEnabled { get; set; } = true;
    public double Volume { get; set; } = 0.6;
    public double Happiness { get; set; } = 65;
    public double Energy { get; set; } = 80;
    public double Boredom { get; set; } = 20;
    public List<string> OwnedItems { get; set; } = new() { "grey_tabby", "hearts" };
    public string? LastDailyBonusUtc { get; set; }
    public bool FirstRunDone { get; set; }
    public bool AutoStartEnabled { get; set; }
    public bool ReminderPopupsEnabled { get; set; } = true;
}

/// <summary>
/// Loads/saves <see cref="MeowSettings"/> as JSON in %APPDATA%/MeowCat (overridable via the
/// MEOWCAT_DATA_DIR environment variable — used by tests and portable setups).
/// Corrupt files are moved aside and replaced with defaults instead of crashing.
/// </summary>
public sealed class SettingsStore
{
    private readonly string _path;

    public SettingsStore(string? dirOverride = null)
    {
        var dir = dirOverride ?? Environment.GetEnvironmentVariable("MEOWCAT_DATA_DIR");
        if (string.IsNullOrWhiteSpace(dir))
        {
            var appdata = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (string.IsNullOrEmpty(appdata)) appdata = AppContext.BaseDirectory;
            dir = Path.Combine(appdata, "MeowCat");
        }
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "config.json");
    }

    public string FilePath => _path;

    public MeowSettings Load()
    {
        try
        {
            if (!File.Exists(_path)) return new MeowSettings();
            var json = File.ReadAllText(_path);
            var s = JsonSerializer.Deserialize<MeowSettings>(json, JsonOpts);
            if (s is null) return new MeowSettings();
            Sanitize(s);
            return s;
        }
        catch (Exception) // corrupt JSON or IO error: keep a backup, start fresh
        {
            try
            {
                if (File.Exists(_path))
                    File.Copy(_path, _path + ".corrupt-" + DateTime.UtcNow.Ticks, overwrite: true);
            }
            catch (IOException) { /* best effort */ }
            return new MeowSettings();
        }
    }

    public void Save(MeowSettings s)
    {
        Sanitize(s);
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(s, JsonOpts));
        File.Move(tmp, _path, overwrite: true);
    }

    private static void Sanitize(MeowSettings s)
    {
        s.Coins = Math.Max(0, s.Coins);
        s.SizeScale = Math.Clamp(s.SizeScale, 0.5, 2.0);
        s.Volume = Math.Clamp(s.Volume, 0.0, 1.0);
        s.Happiness = Math.Clamp(s.Happiness, 0, 100);
        s.Energy = Math.Clamp(s.Energy, 0, 100);
        s.Boredom = Math.Clamp(s.Boredom, 0, 100);
        s.OwnedItems ??= new List<string> { "grey_tabby", "hearts" };
        s.Accessories ??= new List<string>();
        if (string.IsNullOrWhiteSpace(s.BreedId)) s.BreedId = "grey_tabby";
        if (string.IsNullOrWhiteSpace(s.EmotePackId)) s.EmotePackId = "hearts";
        if (string.IsNullOrWhiteSpace(s.CatName)) s.CatName = "Mochi";

        // v1 → v2 migration: the British Shorthair grew into the Grey Tabby star breed
        if (s.BreedId == "british") s.BreedId = "grey_tabby";
        for (var i = 0; i < s.OwnedItems.Count; i++)
            if (s.OwnedItems[i] == "british") s.OwnedItems[i] = "grey_tabby";
        if (!s.OwnedItems.Contains(s.BreedId)) s.OwnedItems.Add(s.BreedId);
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };
}
