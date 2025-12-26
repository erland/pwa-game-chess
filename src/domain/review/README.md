# Review replay (v3 Step 3)

This folder contains a deterministic replay engine that turns a persisted `GameRecord`
into a list of `GameState` frames.

The goal is to enable v4's "Review a finished game" UI without requiring a backend.

## Key API

- `replayGameRecord(record)` → `ReplayResult` with `frames` (ply 0..N)
- `getReplayStateAtPly(result, ply)` → convenience accessor
