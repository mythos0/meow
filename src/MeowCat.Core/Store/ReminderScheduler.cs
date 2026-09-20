// ReminderScheduler.cs — pure reminder/timer logic with injectable clock.
// Port of reminder-scheduler.js (once/hourly/daily/weekly + grace window).

namespace MeowCat.Core.Store;

public sealed class ReminderScheduler
{
    private static int _id = 1;
    private readonly Func<long> _now;
    private readonly Dictionary<string, ReminderItem> _items = new();

    public ReminderScheduler(Func<long>? now = null)
    {
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    // spec: label, at (epoch ms), repeat, anim, sound
    public ReminderItem Add(ReminderItem spec)
    {
        if (spec.At <= 0) throw new ArgumentException("at (epoch ms) required");
        string id = string.IsNullOrEmpty(spec.Id) ? "r" + (_id++) : spec.Id;
        var item = new ReminderItem
        {
            Id = id,
            Label = string.IsNullOrEmpty(spec.Label) ? "Reminder" : spec.Label,
            At = spec.At,
            Repeat = spec.Repeat is "once" or "daily" or "hourly" or "weekly" ? spec.Repeat : "once",
            Anim = string.IsNullOrEmpty(spec.Anim) ? "dance" : spec.Anim,
            Sound = spec.Sound,
        };
        _items[id] = item;
        return item;
    }

    public bool Remove(string id) => _items.Remove(id);
    public List<ReminderItem> List() => _items.Values.OrderBy(i => i.At).ToList();
    public void Clear() => _items.Clear();
    public int Size => _items.Count;

    private static long? NextOccurrence(ReminderItem item, long fromMs)
    {
        long? step = item.Repeat switch
        {
            "daily" => 86400000L,
            "hourly" => 3600000L,
            "weekly" => 604800000L,
            _ => null,
        };
        if (step == null) return null;
        long at = item.At;
        while (at <= fromMs) at += step.Value;
        return at;
    }

    /// <summary>
    /// Returns reminders that are due at now() and reschedules repeating ones.
    /// A reminder stays "due" for a grace window (default 60s) so a tick delay still fires it.
    /// </summary>
    public List<ReminderItem> DueReminders(long graceMs = 60000)
    {
        long now = _now();
        var due = new List<ReminderItem>();
        foreach (var item in _items.Values.ToList())
        {
            if (now >= item.At && now <= item.At + graceMs)
            {
                due.Add(item);
                if (item.Repeat == "once") _items.Remove(item.Id);
                else
                {
                    var nx = NextOccurrence(item, now);
                    if (nx.HasValue) item.At = nx.Value; else _items.Remove(item.Id);
                }
            }
            else if (now > item.At + graceMs)
            {
                // missed beyond grace: skip forward
                if (item.Repeat == "once") _items.Remove(item.Id);
                else
                {
                    var nx = NextOccurrence(item, now);
                    if (nx.HasValue) item.At = nx.Value; else _items.Remove(item.Id);
                }
            }
        }
        return due;
    }

    public long? MsUntilNext()
    {
        long now = _now();
        long best = long.MaxValue;
        foreach (var it in _items.Values)
            if (it.At > now) best = Math.Min(best, it.At - now);
        return best == long.MaxValue ? null : best;
    }
}
