# Development plan (v2) — Play versus computer (User Journey 6.2)
Repository: **pwa-game-chess**  
Prerequisite: **Version 1** (Local game / Journey 6.1) is implemented and stable.

This is **Version 2** of the development plan. It adds **vs Computer** play while preserving architecture for:
- **v3:** Online real-time (6.3)
- **v4:** Review finished game (6.4)

---

## Scope of v2
Implement **User Journey 6.2 — Play versus computer**:

1. User selects **Play → vs Computer**
2. User selects **side** (White/Black/Random) and **difficulty**
3. Game starts; computer responds after each user move
4. User can finish game normally (mate/stalemate/draw/resign/timeout)  
5. *(Optional in v2)* User can request a **hint** (suggested move)

### Non-goals for v2 (deferred)
- Online synchronization and matchmaking (v3)
- Full review/rewind UI, PGN/SAN export/import (v4)
- Advanced analysis lines/evaluations display (future/v4+)

---

## Design constraints (to keep v3–v4 easy)
- Add a **clean AI boundary** in `src/domain/ai/`:
  - UI does not talk to engine directly
  - Game loop requests a move via an interface
- Keep the **game reducer authoritative**:
  - AI proposes a move
  - reducer validates and applies it (never trust AI blindly)
- AI computations should be **cancelable** (user resigns, restarts, navigates away).
- Prefer **Web Worker** for AI thinking to keep UI responsive.

---

## Proposed AI strategy for v2
Deliver in layers so the game is playable early and can be improved without refactors:

1. **Baseline bot (always available):**
   - Chooses a legal move using simple heuristics (captures > checks > development > random)
   - Deterministic option (seeded RNG) for reproducible tests
2. **Stronger engine adapter (optional but recommended):**
   - A chess engine (e.g., Stockfish compiled to WASM) running in a Web Worker
   - Difficulty controlled by depth/time and/or skill parameters
   - Same interface as baseline bot (swap via dependency injection)

The plan below includes both layers as separate steps.

---

## Steps (each step is realistic to implement in one prompt)

### Step 1 — Add “vs Computer” entry point and setup UX
**Goal:** User can reach a vs-computer game with the needed options.

**Deliverables**
- Home action: **Play → vs Computer**
- `VsComputerSetupPage` (or integrated setup) with:
  - Side: `White`, `Black`, `Random`
  - Difficulty: presets (example) `Easy`, `Medium`, `Hard`, `Custom`
  - Time control (reuse v1 presets)
  - Orientation: default to chosen side (white-bottom if player is White), with override
  - “Start” button
- New `GameMode = 'local' | 'vsComputer'` in domain types (future-safe for v3)

**How to test**
- Manual: navigate Home → vs Computer → Start
- Component test: setup defaults and “Start” routing

---

### Step 2 — Introduce AI interfaces and orchestration (domain + UI glue)
**Goal:** Establish a stable boundary for any future engine.

**Deliverables**
- `src/domain/ai/types.ts`:
  - `AiDifficulty` (enum or union)
  - `AiConfig` (difficulty, thinkTimeMs, maxDepth, randomness, etc.)
  - `AiMoveRequest` (state snapshot + config)
  - `AiMoveResult` (move + optional metadata)
  - `ChessAi` interface:
    - `init?(): Promise<void>`
    - `getMove(request, signal): Promise<AiMoveResult>`
    - `dispose?(): Promise<void>`
- `AiController` (or hook) in UI/app layer that:
  - starts AI thinking when it becomes AI’s turn
  - cancels thinking on state change, restart, resign, navigation
  - blocks user input while AI is moving (except UI controls)
- Ensure **reducer remains authoritative**:
  - AI move is validated against `generateLegalMoves`; if invalid, fallback or error state

**How to test**
- Unit test: AI controller calls `getMove` only when side-to-move is AI
- Unit test: cancellation prevents stale AI move from being applied

---

### Step 3 — Implement a baseline “HeuristicBot” (no external engine)
**Goal:** Make vs-computer playable with a simple, reliable bot.

**Deliverables**
- `HeuristicBot` implementation using only domain functions:
  - gets all legal moves
  - scores them with simple heuristics (example weighting):
    - checkmate-in-1 > checks > captures (by piece value) > promotions > center control > random
  - optional deterministic RNG seed for reproducible choices
- Difficulty mapping:
  - Easy: shallow heuristics + more randomness
  - Medium: stronger heuristics + less randomness
  - Hard: minimal randomness + basic lookahead of 1 ply (optional)
- Ensure it runs fast (< 50ms typically); no worker needed yet.

**How to test**
- Unit tests:
  - bot always returns a legal move when legal moves exist
  - bot prefers capturing a queen over a pawn (basic sanity)
  - bot promotes when available

---

### Step 4 — Add the vs-computer “game loop” behavior
**Goal:** After the player moves, the computer responds automatically.

**Deliverables**
- In `GamePage` (or a dedicated game container):
  - If mode is `vsComputer`:
    - define player color and AI color
    - after any state transition, if it’s AI’s turn and game is in progress:
      - request AI move
      - apply it through reducer
- UI state:
  - show “Computer thinking…” indicator
  - disable board interaction during AI turn
- Ensure correctness around end states:
  - AI must not move after game ended
  - if player resigns during AI thinking, cancel and end immediately

**How to test**
- Integration test (component-level):
  - start vs-computer game, make a move, verify AI replies
- Edge test: resign during “thinking” stops AI move

---

### Step 5 — Difficulty tuning UI + configuration plumbing
**Goal:** Make difficulty selection meaningful and extensible.

**Deliverables**
- Difficulty presets mapped to `AiConfig`:
  - `Easy`: thinkTimeMs ~ 50–150, randomness high
  - `Medium`: thinkTimeMs ~ 150–400, randomness medium
  - `Hard`: thinkTimeMs ~ 400–1200, randomness low, optional depth=2 heuristic search
- Optional “Custom” advanced toggle:
  - slider for think time
  - slider for randomness
- Persist last used vs-computer settings locally (optional; safe for v3/v4)

**How to test**
- Unit tests for config mapping
- Manual: verify difficulty change noticeably affects play style

---

### Step 6 — Hint feature (optional but recommended for v2)
**Goal:** Allow user to request a suggested move without forcing it.

**Deliverables**
- “Hint” button available during player’s turn in vs-computer mode
- Hint logic:
  - call the same AI (or a stronger config) to suggest a move
  - highlight suggested move on board (from/to squares)
  - do not auto-play it
- Hint cancellation:
  - if user moves before hint returns, ignore hint result

**How to test**
- Component test: hint highlights a legal move
- Edge test: hint result ignored after player action

---

### Step 7 — Strong engine adapter in a Web Worker (recommended upgrade)
**Goal:** Make “Hard” feel stronger without blocking the UI.

**Deliverables**
- `EngineWorker` scaffold:
  - Web Worker file and message protocol: init / setPosition / go / stop / dispose
- `UciEngineAdapter` (or similar) implementing `ChessAi`
  - translates `GameState` to FEN
  - requests best move for given depth/time
- Keep `HeuristicBot` as fallback:
  - if worker fails to load, use heuristic bot automatically

**How to test**
- Unit tests for worker message protocol (mock worker)
- Integration test: engine returns a move and it is applied legally
- Manual: verify UI stays responsive while engine thinks

*(Note: This step is the only one that introduces significant extra complexity. Keeping it isolated behind the `ChessAi` interface preserves the rest of the codebase.)*

---

### Step 8 — Performance, UX polish, and CI safety checks for v2
**Goal:** Ensure vs-computer feels polished and doesn’t regress v1.

**Deliverables**
- Disable/enable logic:
  - board disabled only during AI turn, not during animations/prompts
- Visual cues:
  - “You vs Computer” header with player colors
  - “Computer thinking…” with optional spinner
- CI:
  - add tests covering at least one vs-computer flow
  - ensure all v1 tests still pass

**How to test**
- `npm test` includes v2 tests
- Manual regression: local mode still works unchanged

---

## Acceptance tests (examples for v2)
- **AT2-001** Start vs-computer game as White; after White’s move, AI plays a legal Black move.
- **AT2-002** Start as Black; AI (White) makes the first move automatically.
- **AT2-003** AI never makes an illegal move (verified by legal-move validation gate).
- **AT2-004** If user resigns during AI thinking, game ends immediately and AI move is not applied.
- **AT2-005** Hint highlights a legal move and does not alter the game state.
- **AT2-006** Difficulty selection changes AI configuration (observable via deterministic test hooks or behavior).

---

## Suggested folder additions (minimal)
```
src/
  domain/
    ai/
      types.ts
      heuristicBot.ts
      uciEngineAdapter.ts        (optional step)
      engineWorker/              (optional step)
        worker.ts
        protocol.ts
```

---

## Notes for continuing to v3 and v4
- v3 (online) can reuse:
  - `GameMode` and serializable `GameState`
  - the authoritative reducer approach
  - cancellation patterns (reconnect/resync)
- v4 (review) can reuse:
  - history recorded by reducer
  - position snapshots (optional) or recomputation via applying moves
  - AI hint infrastructure (for analysis suggestions later)

