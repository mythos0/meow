using System;
using System.IO;
using System.Windows;
using MeowCat.Core;
using MeowCat.Platform;
using MeowCat.Windows;

namespace MeowCat;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var store = new SettingsStore();
        var settings = store.Load();
        var wallet = new CoinWallet(settings.Coins);
        var sound = new SoundService
        {
            Enabled = settings.SoundEnabled,
            Volume = settings.Volume,
        };

        // verify the SFX pack is present (helps diagnose broken installs)
        foreach (var f in SoundCatalog.AllFiles())
            if (!sound.FileExists(f))
                System.Diagnostics.Trace.WriteLine($"MeowCat: missing sound asset {f}");

        var cat = new CatWindow(settings, store, wallet, sound);
        cat.Show();
    }
}
