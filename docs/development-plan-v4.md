# Development plan (v4) — Review a finished game (User Journey 6.4)
Repository: **pwa-game-chess**  
Prerequisite: **v1 (Local)**, **v2 (vs Computer)**, and **v3 (Online real-time)** are implemented and stable.

This is **Version 4** of the development plan. It adds **game review** for finished games (and optionally in-progress games),
including move navigation, metadata, and import/export primitives that are useful for sharing and analysis.

---

## Scope of v4
Implement **User Journey 6.4 — Review a finished game**:

1. User opens **History**
2. User selects a finished game
3. User can:
   - step forward/back
   - jump to any move
   - see captured pieces (optional)
   - copy/export **PGN**
   - copy/export **FEN** at any move
4. User can share a link (for online games) or share/export a file (for local/vs-computer)

### Non-goals for v4 (deferred)
- Engine evaluation lines, blunder detection, opening explorer (future)
- Puzzle extraction / tactics trainer from games (future)
- Social features (comments, likes) (future)

---

## Key design constraints (so review stays consistent)
- Review must be **deterministic**:
  - Replaying the move list from the recorded start position must always reach the same positions.
- Prefer storing or reconstructing **canonical move data**:
  - `from`, `to`, `promotion` (and optionally flags like castling/en-passant)
- SAN/PGN generation should be:
  - correct enough for standard interchange
  - but isolated so improvements don’t affect the core game engine

---

## What data v4 assumes is already available (from v1–v3)
### Local/vs-computer games (v1/v2)
- Game records in local storage (or IndexedDB) with:
  - `gameId`, `mode`, players, timeControl, startedAt/finishedAt
  - `moves[]` with at least `{from,to,promotion?}`
  - `result` + `terminationReason`
  - **starting position** (assume standard start in v1; allow custom in future)

### Online games (v3)
- Match records backend-side with:
  - `match_moves` append-only log
  - final `result` and `terminationReason`
  - player identities + timeControl
- Client can fetch finished matches and their moves

If any of these are missing in your implementation, v4 Step 1 includes a “data readiness” patch.

---

## Steps (each step is realistic to implement in one prompt)

### Step 1 — Data readiness + unified “GameRecord” model
**Goal:** Ensure review works uniformly across local, vs-computer, and online games.

**Deliverables**
- Define a unified domain DTO:
  - `GameRecord` (id, mode, players, timeControl, startedAt, finishedAt, result, terminationReason, moves)
- Ensure v1/v2 persistence includes:
  - finished games list
  - moves list
  - minimal metadata
- Ensure v3 online fetch can map backend match+move rows into `GameRecord`

**How to test**
- Unit tests mapping online payload → `GameRecord`
- Manual: play a local game, finish it, verify record is saved

---

### Step 2 — History screen (list + filters)
**Goal:** Provide the entry point to journey 6.4.

**Deliverables**
- `HistoryPage`:
  - list of finished games sorted by date (newest first)
  - displays: opponent (or “Local”), mode, time control, result, date/time
  - basic filters:
    - Mode: All / Local / vs Computer / Online
    - Result: All / Win / Loss / Draw
  - actions:
    - open review
    - delete local records (local/vs-computer only; online deletion optional and likely disabled)
- Routes:
  - `/history`
  - `/review/:gameId`

**How to test**
- Component test: list renders and filters
- Manual: open a record → navigates to review

---

### Step 3 — Review state engine (replay + navigation)
**Goal:** Create the deterministic “replay engine” that powers the UI.

**Deliverables**
- `ReviewSession` state:
  - `record: GameRecord`
  - `index: number` (0 = start position, 1..n = after move i)
  - `positions[]` cache (optional but recommended)
- Functions:
  - `buildPositions(record)`:
    - start from initial state
    - apply each move using domain `applyMove`
    - store intermediate positions (or store FENs)
  - `goTo(index)`, `next()`, `prev()`
  - `getFenAt(index)`
- Robustness:
  - if a move replay fails (should not happen), show a clear error and which move is invalid

**How to test**
- Unit test: replay a known move list produces expected final state
- Unit test: goTo/next/prev boundaries

---

### Step 4 — Review UI: board + move list + navigation controls
**Goal:** Provide the actual review experience.

**Deliverables**
- `ReviewPage` layout:
  - board (reuse `ChessBoard` component)
  - move list (notation list, initially can be coordinate notation like `e2-e4`)
  - navigation controls:
    - ⏮ start, ◀ prev, ▶ next, ⏭ end
  - display:
    - current move number / ply
    - side to move indicator at current index
    - last move highlight
- “Jump to move”:
  - tapping a move in the list sets the review index

**How to test**
- Component test: clicking a move jumps board position
- Manual: scrub through moves and verify board updates

---

### Step 5 — Captured pieces + clocks (optional but valuable)
**Goal:** Add common review UX features without impacting core architecture.

**Deliverables**
- Captured pieces view:
  - derived by comparing start pieces vs current position, or tracked during replay
- Clock display in review (if time data exists):
  - For local/vs-computer: if per-move timestamps were recorded, show remaining time per move (optional)
  - For online: show server-authoritative clock values per move (if stored)  
  *(If time-per-move was not stored previously, you can display only final clocks or omit in v4.)*

**How to test**
- Unit tests: captured piece derivation
- Manual: captured pieces update as you navigate

---

### Step 6 — SAN generation (for display) + PGN export
**Goal:** Produce good interoperability and a nicer move list.

**Deliverables**
- SAN generator module in `src/domain/notation/`:
  - `toSAN(stateBeforeMove, move, stateAfterMove)`:
    - piece letter (blank for pawn)
    - capture marker `x`
    - disambiguation when needed
    - check `+` / mate `#`
    - castling `O-O` / `O-O-O`
    - promotion `=Q` etc.
- PGN exporter:
  - headers: Event, Site, Date, White, Black, Result, TimeControl (if present)
  - move text using SAN, wrapped reasonably
- UI:
  - move list shows SAN
  - “Copy PGN” button
  - “Download PGN” button (as `.pgn` file)

**How to test**
- Unit tests for SAN edge cases:
  - castling, promotion, capture, check/mate markers
  - ambiguous moves requiring disambiguation
- Roundtrip test ready for future (v4.1):
  - export PGN then re-import yields same moves (can be introduced in Step 7)

---

### Step 7 — FEN export (any move) + basic PGN import (optional but recommended)
**Goal:** Make review and sharing practical.

**Deliverables**
- “Copy FEN” button that copies the FEN at the current index
- Optional “Import” entry point:
  - paste PGN → parse moves → create a temporary `GameRecord` for review
  - show parse errors with helpful context
- Basic PGN parser:
  - support headers and SAN move list for common cases
  - ignore comments/variations initially (can improve later)

**How to test**
- Unit test: current FEN changes when navigating
- Import test: known PGN loads and replays without errors

---

### Step 8 — Online sharing link + deep-link review
**Goal:** For online matches, share a link that opens the same review.

**Deliverables**
- Share link format (example):
  - `/review/online/:matchId`
- Review page can load:
  - local record by `gameId`
  - or online record by `matchId` (fetch match + moves)
- “Share” button for online games:
  - uses Web Share API when available
  - fallback: copy URL

**How to test**
- Manual: open shared link in a new browser session → review loads correctly

---

### Step 9 — UX polish + accessibility + regression safety
**Goal:** Make review feel like a finished feature and keep earlier versions stable.

**Deliverables**
- Responsive layout:
  - board + move list side-by-side on large screens
  - move list in drawer/tab on small screens
- Accessibility:
  - keyboard shortcuts: left/right arrows for prev/next, home/end for start/end
  - screen-reader labels for navigation buttons
- CI:
  - add review smoke tests
  - ensure v1/v2/v3 flows still pass

**How to test**
- `npm test` passes
- Manual: review works on phone/tablet/desktop

---

## Acceptance tests (examples for v4)
- **AT4-001** History lists finished local, vs-computer, and online games (as available).
- **AT4-002** Opening a finished game shows a board at the starting position.
- **AT4-003** Next/prev/jump updates board deterministically and matches the move list.
- **AT4-004** “Copy FEN” copies the correct FEN for the current position.
- **AT4-005** “Copy/Download PGN” outputs a valid PGN with headers and SAN moves.
- **AT4-006** Online shared link opens and loads the same match review.

---

## Suggested folder additions
```
src/
  domain/
    notation/
      san.ts
      pgnExport.ts
      pgnImport.ts          (optional)
    review/
      replay.ts
      types.ts
  pages/
    HistoryPage.tsx
    ReviewPage.tsx
```

---

## Notes (future improvements beyond v4)
- Engine analysis (best lines, eval bar)
- Blunder/mistake detection (compare user move vs engine best)
- Opening names + explorer
- Annotated PGN with comments and variations
- Puzzle extraction from tactics moments

