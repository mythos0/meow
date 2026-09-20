// TrayService.cs — system tray icon + menu (WinForms NotifyIcon).
// Menu mirrors the Electron v3.2 tray: Dance / Feed / Sleep, Reminders,
// Settings, Quit + reminder balloon notifications.

namespace MeowCat.Platform;

using System.Windows.Forms;

public interface ICatTrayHost
{
    void Dance();
    void Feed();
    void SleepNow();
    void OpenSettings();
    void OpenReminders();
    void Quit();
    bool SoundOn { get; }
    void ToggleSound();
    string BreedName { get; }
}

public sealed class TrayService : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly ICatTrayHost _host;

    public TrayService(ICatTrayHost host, string iconPath)
    {
        _host = host;
        _icon = new NotifyIcon
        {
            Text = "MeowCat — your desktop cat",
            Visible = true,
        };
        try { _icon.Icon = new System.Drawing.Icon(iconPath); }
        catch { /* icon optional */ }

        _icon.DoubleClick += (_, _) => _host.OpenSettings();
        _icon.ContextMenuStrip = BuildMenu();
    }

    private ContextMenuStrip BuildMenu()
    {
        var m = new ContextMenuStrip();
        m.Items.Add($"🐱 {_host.BreedName} — MeowCat").Enabled = false;
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(Item("💃 Dance!", _host.Dance));
        m.Items.Add(Item("🍖 Feed", _host.Feed));
        m.Items.Add(Item("💤 Sleep now", _host.SleepNow));
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(Item("⏰ Reminders…", _host.OpenReminders));
        m.Items.Add(Item("⚙ Settings…", _host.OpenSettings));
        m.Items.Add(Item($"Sound: {(_host.SoundOn ? "On" : "Off")}", _host.ToggleSound));
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(Item("Quit", _host.Quit));
        return m;
    }

    private static ToolStripItem Item(string label, Action onClick)
    {
        var it = new ToolStripMenuItem(label);
        it.Click += (_, _) => onClick();
        return it;
    }

    /// <summary>Reminder balloon (replaces Electron's toast Notification — no extra process).</summary>
    public void Balloon(string title, string body, Action? onClick = null)
    {
        try
        {
            _icon.BalloonTipTitle = title;
            _icon.BalloonTipText = body;
            if (onClick != null) _icon.BalloonTipClicked += (_, _) => onClick();
            _icon.ShowBalloonTip(6000);
        }
        catch { /* balloon optional */ }
    }

    public void Dispose()
    {
        try { _icon.Visible = false; _icon.Dispose(); } catch { }
    }
}
