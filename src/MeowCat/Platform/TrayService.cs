using System;
using System.Windows.Forms;
using MeowCat.Windows;

namespace MeowCat.Platform;

/// <summary>System tray icon (WinForms NotifyIcon + native ContextMenuStrip — rock solid).</summary>
public sealed class TrayService : IDisposable
{
    private readonly NotifyIcon _icon;
    private readonly ICatCommandHost _host;

    public TrayService(ICatCommandHost host, string iconPath)
    {
        _host = host;
        _icon = new NotifyIcon
        {
            Text = "MeowCat — your desktop cat",
            Visible = true,
        };
        try { _icon.Icon = new System.Drawing.Icon(iconPath); }
        catch (Exception) { /* icon optional */ }

        _icon.DoubleClick += (_, _) => _host.DoStore();
        _icon.ContextMenuStrip = BuildMenu();
    }

    private ContextMenuStrip BuildMenu()
    {
        var m = new ContextMenuStrip();
        m.Items.Add($"🐱 {_host.CatName} — MeowCat").Enabled = false;
        m.Items.Add(new ToolStripSeparator());
        m.Items.Add($"{(_host.IsAngryVisible ? "😠 angry mode" : "😺 happy mode")}").Enabled = false;
        m.Items.Add(new ToolStripSeparator());

        m.Items.Add(Item("Feed a treat", _host.DoFeed));
        m.Items.Add(Item("Dance for me", _host.DoDance));
        m.Items.Add(Item("Take a nap", _host.DoSleep));
        m.Items.Add(Item("Play with yarn", _host.DoPlay));
        m.Items.Add(Item(_host.IsAngryVisible ? "Calm down 😺" : "Make angry 😠", _host.DoMakeAngry));

        var jump = (ToolStripMenuItem)m.Items.Add("Jump to window");
        var targets = _host.GetJumpTargets();
        if (targets.Count == 0)
        {
            jump.DropDownItems.Add("(no windows found)").Enabled = false;
        }
        else
        {
            foreach (var w in targets)
            {
                var target = w;
                jump.DropDownItems.Add(Truncate(w.Title, 44), null, (_, _) => _host.JumpTo(target));
            }
        }

        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(Item($"Sound: {(_host.SoundOn ? "On" : "Off")}", _host.ToggleSound));
        var size = (ToolStripMenuItem)m.Items.Add("Size");
        foreach (var (label, val) in new[] { ("Tiny (0.6x)", 0.6), ("Small (0.8x)", 0.8), ("Normal (1x)", 1.0), ("Big (1.4x)", 1.4), ("Giant (2x)", 2.0) })
        {
            var v = val;
            var item = (ToolStripMenuItem)size.DropDownItems.Add($"{label}{(Math.Abs(_host.CurrentSize - v) < 0.01 ? "  ✓" : "")}");
            item.Click += (_, _) => { _host.SetSize(v); RefreshMenu(); };
        }
        size.DropDownOpening += (_, _) => { };

        m.Items.Add(new ToolStripSeparator());
        m.Items.Add(Item("Cat Store…", _host.DoStore));
        m.Items.Add(Item("Reminders…", _host.DoReminders));
        m.Items.Add(Item("Settings…", _host.DoSettings));
        m.Items.Add(Item("Exit", _host.DoExit));
        return m;
    }

    /// <summary>Shows a toast/balloon from the tray icon (backup notification for reminders).</summary>
    public void ShowBalloon(string title, string message)
    {
        try
        {
            _icon.BalloonTipTitle = string.IsNullOrWhiteSpace(title) ? "MeowCat" : title;
            _icon.BalloonTipText = string.IsNullOrWhiteSpace(message) ? "MeowCat reminder" : message;
            _icon.ShowBalloonTip(5000);
        }
        catch (Exception) { /* balloon optional */ }
    }

    private void RefreshMenu()
    {
        var old = _icon.ContextMenuStrip;
        _icon.ContextMenuStrip = BuildMenu();
        old?.Dispose();
    }

    private static ToolStripMenuItem Item(string text, Action onClick)
    {
        var it = new ToolStripMenuItem(text);
        it.Click += (_, _) => onClick();
        return it;
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..(n - 1)] + "…";

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
    }
}
