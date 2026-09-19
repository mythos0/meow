using System;

namespace MeowCat.Core;

/// <summary>
/// Owns the cat's physical world-state: position, facing, scale, walking integration and jump
/// playback. Pure math, no WPF — fully unit-testable. Y is the *feet* (floor) line.
/// </summary>
public sealed class CatModel
{
    public double X { get; set; }             // horizontal center of the cat, DIU
    public double Y { get; set; }             // feet line
    public int Facing { get; set; } = 1;      // +1 right, -1 left
    public double Scale { get; set; } = 1.0;
    public double WalkSpeed { get; set; } = 70;
    public double RunSpeed { get; set; } = 165;

    public double MinX { get; set; }
    public double MaxX { get; set; } = 1200;  // host updates to real screen width

    public JumpPlan? Jump { get; private set; }
    public double JumpProgress { get; private set; }
    public bool JumpFinished { get; private set; }

    /// <summary>Host/brain acknowledges a finished jump (edge consumed).</summary>
    public void ClearJumpFinished() => JumpFinished = false;

    private int _walkDir = 1;

    public void SetBounds(double minX, double maxX)
    {
        MinX = minX; MaxX = Math.Max(maxX, minX + 1);
    }

    public void StartJump(JumpPlan plan)
    {
        Jump = plan ?? throw new ArgumentNullException(nameof(plan));
        JumpProgress = 0;
        JumpFinished = false;
        Facing = plan.EndX >= plan.StartX ? 1 : -1;
    }

    /// <summary>Begins a ground move in a random direction; returns the chosen direction.</summary>
    public int StartGroundMove(Random rng, bool running)
    {
        _walkDir = rng.Next(2) == 0 ? 1 : -1;
        Facing = _walkDir;
        return _walkDir;
    }

    public int CurrentDir => _walkDir;

    /// <summary>
    /// Integrates one frame. Returns true when a jump has just completed (edge-trigger).
    /// </summary>
    public bool Tick(double dt, CatState state)
    {
        switch (state)
        {
            case CatState.Walking or CatState.Running or CatState.ChasingCursor:
            {
                var speed = state == CatState.Running ? RunSpeed
                          : state == CatState.ChasingCursor ? RunSpeed * 0.9
                          : WalkSpeed;
                X += _walkDir * speed * Scale * dt;
                if (X < MinX + 40) { X = MinX + 40; _walkDir = Facing = 1; }
                if (X > MaxX - 40) { X = MaxX - 40; _walkDir = Facing = -1; }
                break;
            }
            case CatState.Jumping when Jump is not null && !JumpFinished:
            {
                JumpProgress += dt / Jump.Duration;
                if (JumpProgress >= 1.0)
                {
                    JumpProgress = 1.0;
                    X = Jump.EndX; Y = Jump.EndY;
                    JumpFinished = true;
                    return true;
                }
                (X, Y) = Jump.At(JumpProgress);
                break;
            }
        }
        return false;
    }

    public void Face(int dir)
    {
        if (dir != 0) { Facing = Math.Sign(dir); _walkDir = Facing; }
    }
}
