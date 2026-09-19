using System;

namespace MeowCat.Core;

/// <summary>Fun-coin economy. Balance is never allowed to go negative.</summary>
public sealed class CoinWallet
{
    public const int StartBalance = 120;
    public const int PassiveIntervalSeconds = 45;
    public const int PassiveAmount = 1;
    public const int ActionReward = 2;
    public const int DanceReward = 5;
    public const int PetReward = 1;
    public const int DailyBonus = 50;

    public int Balance { get; private set; } = StartBalance;
    public int TotalEarned { get; private set; }
    public int TotalSpent { get; private set; }

    public event Action<int>? Changed;

    public CoinWallet() { }
    public CoinWallet(int initial) => Balance = Math.Max(0, initial);

    public void Earn(int amount, string reason)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount), "earn amount must be positive");
        Balance += amount;
        TotalEarned += amount;
        Changed?.Invoke(Balance);
    }

    public bool TrySpend(int amount, string reason)
    {
        if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount), "spend amount cannot be negative");
        if (amount > Balance) return false;
        Balance -= amount;
        TotalSpent += amount;
        Changed?.Invoke(Balance);
        return true;
    }
}
