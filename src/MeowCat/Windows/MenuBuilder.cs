using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using MeowCat.Core;
using MeowCat.Platform;

namespace MeowCat.Windows;

/// <summary>Contract the shared menu drives (implemented by CatWindow; used by tray too).</summary>
public interface ICatCommandHost
{
    void DoFeed();
    void DoDance();
    void DoSleep();
    void DoPlay();
    void DoStore();
    void DoReminders();
    void DoSettings();
    void DoMakeAngry();
    void ToggleSound();
    bool SoundOn { get; }
    void SetSize(double scale);
    double CurrentSize { get; }
    void DoExit();
    IReadOnlyList<TargetWindow> GetJumpTargets();
    void JumpTo(TargetWindow target);
    string CatName { get; }
    /// <summary>Whether the cat is currently in angry mode (drives the menu label).</summary>
    bool IsAngryVisible { get; }
}

/// <summary>The right-click menu shared by the cat and the tray icon.</summary>
public static class MenuBuilder
{
    public static ContextMenu Build(ICatCommandHost host)
    {
        var menu = new ContextMenu { PlacementTarget = null };

        var nameItem = new MenuItem { Header = $"{host.CatName}  (v{Version}){(host.IsAngryVisible ? "  😠" : "")}", IsEnabled = false };
        menu.Items.Add(nameItem);
        menu.Items.Add(new Separator());

        menu.Items.Add(Item("Feed a treat", () => host.DoFeed()));
        menu.Items.Add(Item("Dance for me", () => host.DoDance()));
        menu.Items.Add(Item("Take a nap", () => host.DoSleep()));
        menu.Items.Add(Item("Play with yarn", () => host.DoPlay()));
        menu.Items.Add(Item(host.IsAngryVisible ? "Calm down 😺" : "Make angry 😠", () => host.DoMakeAngry()));

        var jump = new MenuItem { Header = "Jump to window" };
        var targets = host.GetJumpTargets();
        if (targets.Count == 0)
        {
            jump.Items.Add(new MenuItem { Header = "(no windows found)", IsEnabled = false });
        }
        else
        {
            foreach (var w in targets)
            {
                var target = w;
                jump.Items.Add(Item(Truncate(w.Title, 42), () => host.JumpTo(target)));
            }
        }
        menu.Items.Add(jump);

        menu.Items.Add(new Separator());
        var sound = Item($"Sound: {(host.SoundOn ? "On" : "Off")}", host.ToggleSound);
        menu.Items.Add(sound);

        var size = new MenuItem { Header = "Size" };
        foreach (var (label, val) in new[] { ("Tiny (0.6x)", 0.6), ("Small (0.8x)", 0.8), ("Normal (1x)", 1.0), ("Big (1.4x)", 1.4), ("Giant (2x)", 2.0) })
        {
            var v = val;
            var mi = Item($"{label}{(Math.Abs(host.CurrentSize - v) < 0.01 ? "  ✓" : "")}", () => host.SetSize(v));
            size.Items.Add(mi);
        }
        menu.Items.Add(size);

        menu.Items.Add(new Separator());
        menu.Items.Add(Item("Cat Store…", () => host.DoStore()));
        menu.Items.Add(Item("Reminders…", () => host.DoReminders()));
        menu.Items.Add(Item("Settings…", () => host.DoSettings()));
        menu.Items.Add(Item("Exit", host.DoExit));
        return menu;
    }

    private static MenuItem Item(string header, Action onClick)
    {
        var mi = new MenuItem { Header = header };
        mi.Click += (_, _) => onClick();
        return mi;
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s[..(n - 1)] + "…" : s;

    private static string Version =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "2.0";
}
