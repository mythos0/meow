using System;

namespace MeowCat.Core;

/// <summary>
/// A ballistic jump from a start point to an end point, sampled by the renderer every frame.
/// Piecewise-parabolic: fast takeoff, zero vertical velocity at the apex, accelerating fall —
/// no overshoot regardless of how high the target is. Pure math, unit-testable.
/// </summary>
public sealed class JumpPlan
{
    public double StartX { get; }
    public double StartY { get; }
    public double EndX { get; }
    public double EndY { get; }
    public double Duration { get; }
    public double ApexY { get; }        // the highest (smallest) y the arc reaches

    private const double ApexFraction = 0.45;   // apex occurs at 45% of the flight time

    public JumpPlan(double startX, double startY, double endX, double endY, double duration, double apexRise = 90)
    {
        if (duration <= 0) throw new ArgumentOutOfRangeException(nameof(duration));
        StartX = startX; StartY = startY; EndX = endX; EndY = endY; Duration = duration;
        ApexY = Math.Min(startY, endY) - Math.Max(30, apexRise);
    }

    /// <summary>Position at normalized progress p in [0,1].</summary>
    public (double X, double Y) At(double p)
    {
        p = Math.Clamp(p, 0, 1);
        var x = StartX + (EndX - StartX) * p;
        double y;
        if (p < ApexFraction)
        {
            var q = p / ApexFraction;
            y = ApexY + (StartY - ApexY) * (1 - q) * (1 - q);      // decelerating rise
        }
        else
        {
            var q = (p - ApexFraction) / (1 - ApexFraction);
            y = ApexY + (EndY - ApexY) * q * q;                    // accelerating fall
        }
        return (x, y);
    }

    /// <summary>Vertical velocity (DIU/s, negative = rising) at progress p. Drives takeoff/apex/landing poses.</summary>
    public double VelocityY(double p)
    {
        p = Math.Clamp(p, 0, 1);
        if (p < ApexFraction)
        {
            var q = p / ApexFraction;
            return -2 * (StartY - ApexY) * (1 - q) / (ApexFraction * Duration);
        }
        var q2 = (p - ApexFraction) / (1 - ApexFraction);
        return 2 * (EndY - ApexY) * q2 / ((1 - ApexFraction) * Duration);
    }
}
