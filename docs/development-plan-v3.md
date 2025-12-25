# Development plan (v3) — Review a finished game (User Journey 6.4, backend-free)
Repository: **pwa-game-chess**  
Prerequisite: **v1 (Local)** and **v2 (vs Computer)** are implemented and stable.

This rewritten **Version 3** plan focuses on delivering **6.4 Review a finished game** (plus the underlying history/persistence needed),
implemented **without any backend** (GitHub Pages friendly).

---

## Scope of v3 (maps to specification 6.4 + FR-040…FR-053 + FR-060…FR-062)
Implement **User Journey 6.4 — Review a finished game**:

1. User opens **History** and selects a game.
2. User can:
   - step forward/back through moves
   - jump to any move
   - view captured pieces (optional but recommended)
   - export/copy **PGN** and **FEN** (at any move)
3. User can import a game (PGN) into the review screen (recommended).

### Non-goals for v3
- Online multiplayer (6.3) — deferred to v4
- Engine analysis lines / eval bar / blunder detection (future)
- Variants (future)

---

## Architectural approach (future-proof for v4 online)
### Core principle: **Append-only move log is the source of truth**
Store each finished game as:
- **start position** (standard start for now; optionally FEN later)
- **metadata** (mode, players, time control, timestamps, result)
- **moves[]** as canonical move records: `{ from, to, promotion? }`
- optional: `san[]`, `resultingFen[]` (can be derived/cached)

This choice makes v4 online easier because online games naturally sync as a move log.

---

## Local persistence strategy (no backend)
### Recommended storage
- Use **IndexedDB** (via a small helper wrapper) for durability and capacity.
- Keep `localStorage` only for small preferences and “resume in-progress game pointer”.

### Data model (local)
- `GameRecord`
  - `id`, `mode` (`local` | `vsComputer`)
  - `players` (display strings)
  - `timeControl` (baseMs, incrementMs, “no clock”)
  - `startedAt`, `finishedAt`
  - `result`, `terminationReason`
  - `initialFen` (optional; default = standard start)
  - `moves: MoveRecord[]`
- `MoveRecord`
  - `from`, `to`, `promotion?`
  - optional: `san`, `timestampMs`, `resultingFen`

---

## Steps (each step is realistic to implement in one sweep)

### Step 1 — GameRecord capture + persistence readiness (v1/v2 patch)
**Goal:** Ensure every completed game produces a durable `GameRecord` with a complete move list.

**Deliverables**
- Create `src/domain/recording/`:
  - `types.ts` (`GameRecord`, `MoveRecord`, `TimeControl`, etc.)
  - `recording.ts` helpers:
    - `startRecording(sessionMeta)`
    - `recordMove(move)`
    - `finalizeRecording(resultMeta)`
- Ensure v1/v2 “game loop”:
  - appends every committed move into a recording buffer
  - on game end, writes `GameRecord` to storage
- Add minimal storage module:
  - `src/storage/gamesDb.ts` (IndexedDB wrapper)
  - `listGames()`, `getGame(id)`, `putGame(record)`, `deleteGame(id)`

**How to test**
- Unit test: recording produces deterministic `moves[]`
- Manual: finish a local game → it appears in storage

---

### Step 2 — History page (list + delete)
**Goal:** Provide the entry point to 6.4.

**Deliverables**
- Add route `/history`
- `HistoryPage.tsx`:
  - list finished games, newest first
  - show: mode, opponent/players, time control, result, date/time
  - actions:
    - **Open review**
    - **Delete** (local only)
- Add “History” entry on Home screen

**How to test**
- Component test: list renders, delete removes, open navigates

---

### Step 3 — Review replay engine (deterministic)
**Goal:** Build the deterministic replay core that powers UI navigation.

**Deliverables**
- `src/domain/review/replay.ts`:
  - `buildPositions(record)` (applies moves using existing domain `applyMove`)
  - caches intermediate states or FENs
  - exposes:
    - `goTo(index)`, `next()`, `prev()`, `start()`, `end()`
    - `getFenAt(index)`
- Clear error reporting if replay fails on a move (should be rare; helps debugging imported PGNs)

**How to test**
- Unit test: replay known move list reaches expected final state
- Unit test: bounds and goTo behavior

---

### Step 4 — Review UI (board + move list + navigation)
**Goal:** Deliver the usable review experience.

**Deliverables**
- Add route `/review/:gameId`
- `ReviewPage.tsx` layout:
  - Board (reuse `ChessBoard` in a **read-only** mode)
  - Move list (initially coordinate notation like `e2–e4`)
  - Navigation controls:
    - ⏮ start, ◀ prev, ▶ next, ⏭ end
  - Display current move number + side to move
  - Highlight last move on board
- Click/tap on a move jumps to it

**How to test**
- Component test: clicking move updates displayed position index
- Manual: scrub through moves; board remains stable and square sizes remain fixed

---

### Step 5 — Captured pieces (recommended)
**Goal:** Provide a key review affordance (FR-043).

**Deliverables**
- Derive captured pieces during replay:
  - compare piece sets or track captures while applying moves
- UI panel:
  - show captured pieces for White/Black

**How to test**
- Unit test: captures computed correctly for a short known line

---

### Step 6 — Notation + export: SAN display + PGN + FEN
**Goal:** Improve move list readability and meet export requirements (FR-017, FR-044, FR-053).

**Deliverables**
- `src/domain/notation/san.ts`: `toSAN(stateBefore, move, stateAfter)`
  - castling (`O-O`, `O-O-O`)
  - captures `x`
  - promotion `=Q`
  - check `+` / mate `#`
  - disambiguation for ambiguous piece moves
- `src/domain/notation/pgnExport.ts`:
  - headers (Event, Date, White, Black, Result, TimeControl if known)
  - SAN move list, line wrapping
- UI buttons on `ReviewPage`:
  - **Copy PGN**
  - **Download PGN**
  - **Copy FEN (current position)**

**How to test**
- Unit tests: SAN edge cases (castle, promo, check/mate, ambiguity)
- Manual: export PGN → paste into a PGN viewer and verify it loads

---

### Step 7 — Import: PGN into review (recommended)
**Goal:** Support FR-060…FR-062 for review usability and sharing without a backend.

**Deliverables**
- `src/domain/notation/pgnImport.ts` (basic parser to start):
  - parse headers + SAN move list
  - ignore comments/variations initially
  - produce `GameRecord` (or `GameRecordDraft`) that can be reviewed immediately
- Add `ImportPage` or “Import” section on History:
  - paste PGN
  - show helpful error messages when invalid

**How to test**
- Unit test: import a known PGN and replay succeeds
- Unit test: invalid token shows error with context

---

### Step 8 — UX polish, accessibility, regression safety
**Goal:** Make the feature feel complete and keep v1/v2 stable.

**Deliverables**
- Responsive layout:
  - desktop: board + move list side-by-side
  - mobile: move list collapsible drawer/tab
- Keyboard shortcuts in review:
  - Left/Right = prev/next
  - Home/End = start/end
- Tests:
  - smoke tests for history + review navigation
  - ensure existing game flows still pass

**How to test**
- `npm test` + `npm run build` pass
- Manual: works on phone/tablet/desktop

---

## Acceptance tests (examples)
- **AT3-001** Finishing a local or vs-computer game saves a `GameRecord` with complete move list.
- **AT3-002** History lists finished games and allows deletion of local records.
- **AT3-003** Review can step forward/back and jump to any move deterministically.
- **AT3-004** Captured pieces update correctly as you navigate.
- **AT3-005** Copy/Download PGN works and re-importing the same PGN reproduces the same positions.
- **AT3-006** Copy FEN returns the correct position at the current review index.

---

## Suggested folder additions
```
src/
  domain/
    recording/
      types.ts
      recording.ts
    review/
      replay.ts
      types.ts
    notation/
      san.ts
      pgnExport.ts
      pgnImport.ts
  storage/
    gamesDb.ts
  pages/
    HistoryPage.tsx
    ReviewPage.tsx
    ImportPage.tsx         (optional)
```
