// SettingsStore.cs — settings + economy persistence with injectable backend.
// Port of settings-store.js: same keys, same unlimited-coins promo semantics,
// same corrupt-safe sanitize. Stored at %APPDATA%\MeowCat\meowcat-settings.json
// (same file the Electron version used, so user settings carry over).

namespace MeowCat.Core.Store;

using System.Text.Json;
using System.Text.Json.Serialization;
using MeowCat.Core.Data;

public sealed class SettingsData
{
    public string Breed { get; set; } = "grey_tabby";
    public double Size { get; set; } = 1.0;              // 0.5 .. 2.0
    public double Opacity { get; set; } = 1.0;           // 0.3 .. 1
    public bool Sounds { get; set; } = true;
    public bool AutoStart { get; set; }
    public bool Topmost { get; set; } = true;
    public double Speed { get; set; } = 55;
    public long Coins { get; set; } = 999999;            // v3.1: promo — effectively unlimited
    public bool UnlimitedCoins { get; set; } = true;     // every breed unlocks free while true
    public List<string> Owned { get; set; } = new() { "grey_tabby" };
    public List<ReminderItem> Reminders { get; set; } = new();
    public int Version { get; set; } = 1;

    // camelCase JSON keys to match the Electron file format
    [JsonIgnore]
    public static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };
}

public sealed class ReminderItem
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public long At { get; set; }                  // epoch ms
    public string Repeat { get; set; } = "once";  // once|daily|hourly|weekly
    public string Anim { get; set; } = "dance";
    public bool Sound { get; set; } = true;
}

public sealed class BuyResult
{
    public bool Ok { get; init; }
    public bool AlreadyOwned { get; init; }
    public bool Free { get; init; }
    public long Coins { get; init; }
    public long Needed { get; init; }
    public string Reason { get; init; } = "";
}

public sealed class SettingsStore
{
    private readonly Func<string?> _read;
    private readonly Action<string> _write;
    private SettingsData _data;

    public SettingsStore(Func<string?> read, Action<string> write)
    {
        _read = read;
        _write = write;
        _data = Load();
    }

    private SettingsData Load()
    {
        try
        {
            string? raw = _read();
            if (string.IsNullOrWhiteSpace(raw)) return Sanitize(new SettingsData());
            var parsed = JsonSerializer.Deserialize<SettingsData>(raw, SettingsData.JsonOpts) ?? new SettingsData();
            return Sanitize(parsed);
        }
        catch
        {
            return Sanitize(new SettingsData());
        }
    }

    private static SettingsData Sanitize(SettingsData p)
    {
        var d = new SettingsData();
        // keep only values whose types fit (JSON deserialization already typed them;
        // re-apply the semantics from settings-store.js)
        d.Owned = new List<string> { "grey_tabby" };
        if (p.Owned != null)
        {
            foreach (var b in p.Owned.Distinct())
            {
                if (!string.IsNullOrEmpty(b)) d.Owned.Add(b);
            }
        }
        if (p.Reminders != null)
        {
            d.Reminders = p.Reminders.Where(r => r != null && r.At != 0 || (r != null && r.At != 0))
                                     .Select(r => r).ToList();
            d.Reminders = p.Reminders.Where(r => r != null).ToList();
        }
        if (p.Version != 0) d.Version = p.Version;
        // adopt every user-set scalar from the file (Electron settings carry over)
        d.Breed = string.IsNullOrEmpty(p.Breed) ? d.Breed : p.Breed;
        d.Size = p.Size;
        d.Opacity = p.Opacity;
        d.Sounds = p.Sounds;
        d.AutoStart = p.AutoStart;
        d.Topmost = p.Topmost;
        d.Speed = p.Speed;
        d.Coins = p.Coins;
        d.UnlimitedCoins = p.UnlimitedCoins;
        // v3.1 promo: unlimited coins -> everything unlocked
        if (d.UnlimitedCoins) d.Owned = Catalog.BreedPrices.Keys.ToList();
        return d;
    }

    private void Persist()
    {
        try { _write(JsonSerializer.Serialize(_data, SettingsData.JsonOpts)); }
        catch { /* disk full etc — keep running */ }
    }

    public SettingsData All => Clone(_data);
    public T Get<T>(Func<SettingsData, T> sel) => sel(Clone(_data));

    private static SettingsData Clone(SettingsData s)
    {
        var c = new SettingsData
        {
            Breed = s.Breed, Size = s.Size, Opacity = s.Opacity, Sounds = s.Sounds,
            AutoStart = s.AutoStart, Topmost = s.Topmost, Speed = s.Speed,
            Coins = s.Coins, UnlimitedCoins = s.UnlimitedCoins,
            Owned = new List<string>(s.Owned),
            Reminders = s.Reminders.Select(r => new ReminderItem
            {
                Id = r.Id, Label = r.Label, At = r.At, Repeat = r.Repeat, Anim = r.Anim, Sound = r.Sound
            }).ToList(),
            Version = s.Version,
        };
        return c;
    }

    public bool Set(Action<SettingsData> mutate)
    {
        try { mutate(_data); }
        catch { return false; }
        Persist();
        return true;
    }

    // ------------------------------------------------------------ economy
    public long AddCoins(int n)
    {
        _data.Coins = Math.Max(0, Math.Min(9999999, _data.Coins + n));
        Persist();
        return _data.Coins;
    }

    public bool CanAfford(string breed)
    {
        if (_data.UnlimitedCoins) return true;
        return Catalog.BreedPrices.TryGetValue(breed, out var price) && price <= _data.Coins;
    }

    public BuyResult BuyBreed(string breed)
    {
        if (!Catalog.BreedPrices.ContainsKey(breed))
            return new BuyResult { Ok = false, Reason = "unknown" };
        if (_data.Owned.Contains(breed))
            return new BuyResult { Ok = true, AlreadyOwned = true, Coins = _data.Coins };
        // v3.1 promo: unlimited coins -> free unlock, nothing deducted
        if (_data.UnlimitedCoins)
        {
            _data.Owned.Add(breed);
            Persist();
            return new BuyResult { Ok = true, Free = true, Coins = _data.Coins };
        }
        int price = Catalog.BreedPrices[breed];
        if (_data.Coins < price)
            return new BuyResult { Ok = false, Reason = "insufficient", Needed = price - _data.Coins };
        _data.Coins -= price;
        _data.Owned.Add(breed);
        Persist();
        return new BuyResult { Ok = true, Coins = _data.Coins };
    }

    public void OwnBreed(string breed)
    {
        if (!_data.Owned.Contains(breed)) { _data.Owned.Add(breed); Persist(); }
    }

    public string Export() => JsonSerializer.Serialize(_data, SettingsData.JsonOpts);
}
