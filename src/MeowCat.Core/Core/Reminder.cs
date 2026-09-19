using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MeowCat.Core;

public enum ReminderRepeat
{
    Once = 0,
    Daily = 1,
    Weekly = 2,
    Every30Minutes = 3,
    EveryHour = 4,
}

/// <summary>One user reminder: when it fires, what it says and how the cat celebrates.</summary>
public sealed class Reminder
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "Reminder";
    public string Message { get; set; } = "";
    public DateTime Time { get; set; } = DateTime.Now.AddMinutes(10);
    public ReminderRepeat Repeat { get; set; } = ReminderRepeat.Once;
    /// <summary>CatState the cat performs when notifying (name string keeps JSON clean).</summary>
    public string Movement { get; set; } = nameof(CatState.Dancing);
    public bool SoundOn { get; set; } = true;
    public bool Enabled { get; set; } = true;
    /// <summary>Set after a One-shot fired (so it does not fire again).</summary>
    public bool FiredOnce { get; set; }

    /// <summary>Human label for the repeat selector.</summary>
    public static string RepeatLabel(ReminderRepeat r) => r switch
    {
        ReminderRepeat.Once => "Once",
        ReminderRepeat.Daily => "Every day",
        ReminderRepeat.Weekly => "Every week",
        ReminderRepeat.Every30Minutes => "Every 30 minutes",
        ReminderRepeat.EveryHour => "Every hour",
        _ => "Once",
    };

    /// <summary>Valid movement ids the notification animation selector offers.</summary>
    public static readonly string[] Movements =
    {
        nameof(CatState.Dancing), nameof(CatState.Jumping), nameof(CatState.PlayingYarn),
        nameof(CatState.Scratching), nameof(CatState.Running), nameof(CatState.Walking),
        nameof(CatState.Sitting), nameof(CatState.ChasingCursor),
    };

    public static CatState MovementState(string movement)
    {
        if (Enum.TryParse(movement, out CatState s) &&
            s is CatState.Dancing or CatState.Jumping or CatState.PlayingYarn or CatState.Scratching
                or CatState.Running or CatState.Walking or CatState.Sitting or CatState.ChasingCursor)
            return s;
        return CatState.Dancing;
    }
}

/// <summary>Persists reminders as JSON next to config.json. Corrupt-safe like SettingsStore.</summary>
public sealed class ReminderStore
{
    private readonly string _path;

    public ReminderStore(string? dirOverride = null)
    {
        var dir = dirOverride ?? Environment.GetEnvironmentVariable("MEOWCAT_DATA_DIR");
        if (string.IsNullOrWhiteSpace(dir))
        {
            var appdata = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (string.IsNullOrEmpty(appdata)) appdata = AppContext.BaseDirectory;
            dir = Path.Combine(appdata, "MeowCat");
        }
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "reminders.json");
    }

    public string FilePath => _path;

    public List<Reminder> Load()
    {
        try
        {
            if (!File.Exists(_path)) return new List<Reminder>();
            var list = JsonSerializer.Deserialize<List<Reminder>>(File.ReadAllText(_path), JsonOpts);
            if (list is null) return new List<Reminder>();
            // sanitize
            foreach (var r in list)
            {
                if (string.IsNullOrWhiteSpace(r.Id)) r.Id = Guid.NewGuid().ToString("N");
                if (string.IsNullOrWhiteSpace(r.Title)) r.Title = "Reminder";
                r.Message ??= "";
                if (!Enum.IsDefined(typeof(ReminderRepeat), r.Repeat)) r.Repeat = ReminderRepeat.Once;
                if (!Reminder.Movements.Contains(r.Movement)) r.Movement = nameof(CatState.Dancing);
            }
            return list;
        }
        catch (Exception)
        {
            try
            {
                if (File.Exists(_path))
                    File.Copy(_path, _path + ".corrupt-" + DateTime.UtcNow.Ticks, overwrite: true);
            }
            catch (IOException) { /* best effort */ }
            return new List<Reminder>();
        }
    }

    public void Save(IEnumerable<Reminder> reminders)
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(reminders, JsonOpts));
        File.Move(tmp, _path, overwrite: true);
    }

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };
}

/// <summary>
/// Fires due reminders. Pure logic driven by <see cref="Tick"/> — fully unit-testable.
/// A reminder fires when now >= its time; one-shots disable themselves, repeating ones
/// roll forward to their next occurrence (catching up at most a few cycles per tick).
/// </summary>
public sealed class ReminderService
{
    private readonly List<Reminder> _reminders;
    private readonly ReminderStore _store;
    private DateTime _lastChecked = DateTime.MinValue;

    /// <summary>Raised on the UI thread (the host polls Tick) for every reminder due now.</summary>
    public event Action<Reminder>? ReminderFired;

    public ReminderService(List<Reminder> reminders, ReminderStore store)
    {
        _reminders = reminders;
        _store = store;
    }

    public IReadOnlyList<Reminder> Reminders => _reminders;

    /// <summary>Checks for due reminders. Call ~1× per second from a timer.</summary>
    public void Tick(DateTime now)
    {
        if ((now - _lastChecked).TotalSeconds < 0.9) return;
        var firstRun = _lastChecked == DateTime.MinValue;
        _lastChecked = now;

        var dirty = false;
        foreach (var r in _reminders.Where(r => r.Enabled).ToList())
        {
            // skip the pile-up on first run after launch: fire only what is at most 5 min late
            if (firstRun && (now - r.Time).TotalMinutes > 5) continue;
            if (r.Time > now) continue;
            if (r.Repeat == ReminderRepeat.Once)
            {
                if (r.FiredOnce) continue;
                r.FiredOnce = true;
                r.Enabled = false;
                dirty = true;
                ReminderFired?.Invoke(r);
                continue;
            }
            // repeating: fire and roll forward
            ReminderFired?.Invoke(r);
            dirty = true;
            var next = r.Time;
            var guard = 0;
            while (next <= now && guard++ < 10000)
                next = NextOccurrence(r, next);
            r.Time = next;
        }
        if (dirty) Persist();
    }

    private void Persist()
    {
        try { _store.Save(_reminders); } catch (Exception) { /* disk issues never kill the cat */ }
    }

    public void Add(Reminder r)
    {
        _reminders.Add(r);
        Persist();
    }

    public bool Remove(string id)
    {
        var n = _reminders.RemoveAll(x => x.Id == id);
        if (n > 0) Persist();
        return n > 0;
    }

    public void Update(Reminder r)
    {
        var i = _reminders.FindIndex(x => x.Id == r.Id);
        if (i < 0) return;
        _reminders[i] = r;
        Persist();
    }

    /// <summary>Next occurrence strictly after the given time for a repeating reminder.</summary>
    public static DateTime NextOccurrence(Reminder r, DateTime from)
    {
        return r.Repeat switch
        {
            ReminderRepeat.Daily => from.AddDays(1),
            ReminderRepeat.Weekly => from.AddDays(7),
            ReminderRepeat.EveryHour => from.AddHours(1),
            ReminderRepeat.Every30Minutes => from.AddMinutes(30),
            _ => from,
        };
    }
}
