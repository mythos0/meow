using System;

namespace MeowCat.Core;

/// <summary>Every possible cat activity. One active at a time.</summary>
public enum CatState
{
    Idle,           // standing/looking around, brief
    Sitting,        // sitting pose, tail flick
    Walking,        // stroll along the floor
    Running,        // zoomies
    Sleeping,       // curled nap with Zzz + purr
    Dancing,        // wiggle dance with music notes
    Jumping,        // ballistic arc to a target window
    ChasingCursor,  // runs toward the mouse pointer
    PlayingYarn,    // bats a yarn ball around
    Scratching,     // scratches at a screen edge (mischief)
    Petted,         // being petted by the user (hearts)
    Dragged,        // held by the user (dangling legs)
    FeedHappy       // just ate a treat
}

public static class CatStateInfo
{
    /// <summary>States that end on their own after a duration chosen by the brain.</summary>
    public static bool IsFinite(CatState s) => s switch
    {
        CatState.Idle or CatState.Walking or CatState.Running or CatState.Sitting
            or CatState.Sleeping or CatState.Dancing or CatState.PlayingYarn
            or CatState.Scratching or CatState.Petted or CatState.FeedHappy
            or CatState.ChasingCursor => true,
        _ => false
    };

    /// <summary>Transition legality — used for user commands and autonomous choices.</summary>
    public static bool CanTransition(CatState from, CatState to)
    {
        // Dragged is host-controlled: nothing starts while dragged, only releasing (sit) exits.
        if (from == CatState.Dragged) return to == CatState.Sitting;
        if (to == CatState.Dragged) return true;
        // Cannot interrupt mid-air jumps.
        if (from == CatState.Jumping && to != CatState.Sitting && to != CatState.Idle) return false;
        return true;
    }
}
