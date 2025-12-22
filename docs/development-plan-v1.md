# Development plan (v1) — Local chess game (User Journey 6.1)
Repository: **pwa-game-chess**  
Target: **PWA** built with **React + TypeScript** and deployed to **GitHub Pages**.

This is **Version 1** of the development plan. It intentionally focuses on **User Journey 6.1 — Start a local game** only, while laying foundations that can be extended in:
- **v2:** vs Computer (6.2)
- **v3:** Online real-time (6.3)
- **v4:** Review finished game (6.4)

---

## Guiding principles for v1 (so v2–v4 remain easy)
- Keep the **rules engine** pure and UI-agnostic (no React imports, no DOM assumptions).
- Keep the **Game state** serializable (plain JSON), so later we can:
  - add persistence / resume
  - send state over network (online mode)
  - feed it to an engine (vs computer)
  - drive review/rewind
- Use a single **GameReducer** (or equivalent) as the authoritative state transition layer:
  - `applyMove(state, move) -> nextState`
  - `getLegalMoves(state, fromSquare?)`
  - `getGameStatus(state)`

---

## Proposed tech stack (v1)
- **Vite + React + TypeScript**
- **Jest + React Testing Library** for UI tests
- **vite-plugin-pwa** for PWA (manifest + service worker)
- **GitHub Actions** workflow for build + deploy to GitHub Pages

---

## Definition of “done” for v1 (User Journey 6.1)
From the home screen, a user can:
1. Choose **Play → Local**
2. Optionally choose a **time control** (including “no clock”) and board orientation
3. Play a full game with **legal-move enforcement**, including:
   - capture, check indication
   - castling, en passant, promotion
   - checkmate and stalemate
   - draw by insufficient material (minimum set)
   - resignation and draw agreement (basic UI)
4. See a final **result screen** and start a new local game or return home

---

## Steps (each step is realistic to implement in one prompt)

### Step 1 — Repo scaffold + GitHub Pages deployment pipeline
**Goal:** Create a working React PWA skeleton that deploys to GitHub Pages for repo `pwa-game-chess`.

**Deliverables**
- Vite React TS app initialized
- Basic folder structure:
  - `src/domain/` (engine + rules)
  - `src/ui/` (components)
  - `src/pages/`
- GitHub Pages config:
  - Vite `base` set to `/pwa-game-chess/`
  - GitHub Actions workflow deploying `dist/` to Pages

**How to test**
- `npm test` runs (even if minimal)
- `npm run build` succeeds
- Deployed page loads via GitHub Pages

---

### Step 2 — App shell + navigation for Local mode
**Goal:** Implement the top-level UX needed to reach “Start local game” in 2–3 clicks.

**Deliverables**
- `HomePage` with primary actions:
  - **Play → Local**
- `LocalSetupPage` (or modal) with:
  - time control: presets (e.g., `No clock`, `5+0`, `3+2`, `10+5`)
  - orientation: `White at bottom` / `Black at bottom`
  - “Start game” button
- `GamePage` route that accepts setup parameters and starts a fresh game

**How to test**
- Manual: start local game from home
- Automated: basic router smoke test

---

### Step 3 — Domain model foundations (board, pieces, coordinates, state)
**Goal:** Establish stable types and utilities that everything else builds on.

**Deliverables**
- Types:
  - `Color = 'w' | 'b'`
  - `PieceType = 'p'|'n'|'b'|'r'|'q'|'k'`
  - `Piece = { color, type }`
  - `Square` representation (recommend: 0–63 index + helpers, or `'a1'..'h8'`)
  - `Move` structure (keep future-compatible):  
    `from, to, promotion?, isCastle?, isEnPassant?, captured?`
  - `GameState` including:
    - piece placement
    - side to move
    - castling rights
    - en passant target (or null)
    - halfmove + fullmove counters
    - history stack (for future review/undo; v1 can keep minimal)
- Utility functions:
  - square conversions, bounds checks
  - “starting position” initializer (FEN parser optional; can hardcode start setup)

**How to test**
- Unit tests for coordinate conversions and start position correctness

---

### Step 4 — Pseudo-legal move generation (piece movement rules)
**Goal:** Generate correct candidate moves **without** yet filtering for king safety.

**Deliverables**
- `generatePseudoLegalMoves(state, fromSquare?)` supporting:
  - pawns (single/double push, captures, promotions, en passant candidates)
  - knights
  - bishops, rooks, queens (sliding with blockers)
  - king (single squares + castle candidates)
- Data returned should be consumable by UI highlights.

**How to test**
- Unit tests for canonical positions:
  - starting position pawn moves
  - knight moves from center/edge
  - sliding blockers
  - basic promotion generation on 7th rank

---

### Step 5 — Check detection + legal move filtering
**Goal:** Only allow moves that are legal under standard chess rules (king may not be left in check).

**Deliverables**
- `isSquareAttacked(state, square, byColor)`
- `isInCheck(state, color)`
- `generateLegalMoves(state, fromSquare?)` = pseudo-legal moves filtered by king safety
- Castling legality checks:
  - king/rook unmoved (rights)
  - path empty
  - king not in check
  - king does not pass through or land in check

**How to test**
- Unit tests for:
  - pinned piece cannot move exposing king
  - moving into check is illegal
  - castling blocked by check / occupied squares

---

### Step 6 — Apply moves + maintain chess state (the reducer core)
**Goal:** Make game progression correct and deterministic.

**Deliverables**
- `applyMove(state, move) -> nextState` handling:
  - normal moves + captures
  - en passant capture execution
  - promotion selection (promotion must be present when required)
  - castling rook movement
  - update:
    - side to move
    - castling rights
    - en passant target
    - halfmove/fullmove counters
  - append move to history (structure ready for v4 review)
- Optional but recommended:
  - `undoMove(state)` for local takebacks later (can be deferred)

**How to test**
- Unit tests for:
  - en passant capture updates board correctly
  - castling updates rook/king squares and rights
  - promotion replaces pawn with selected piece

---

### Step 7 — Game end detection (v1 minimum set)
**Goal:** Determine when the local game ends and why.

**Deliverables**
- `getGameStatus(state)` returning:
  - `inProgress`
  - `checkmate` (winner color)
  - `stalemate`
  - `drawInsufficientMaterial` (minimum set)
- Minimum insufficient material rules:
  - K vs K
  - K+N vs K
  - K+B vs K
  - K+B vs K+B (bishops on same color)
- Integrate with `generateLegalMoves`:
  - if no legal moves: checkmate vs stalemate depends on `isInCheck`

**How to test**
- Unit tests with known mate/stalemate and insufficient material positions

---

### Step 8 — Board UI (rendering + selection + legal move highlighting)
**Goal:** Show a playable chessboard with clear interaction feedback.

**Deliverables**
- `ChessBoard` component:
  - renders 8×8 grid and pieces (SVG or Unicode symbols)
  - supports orientation flip (white-bottom vs black-bottom)
  - shows:
    - selected square
    - legal destination highlights (toggle optional)
    - last move highlight
    - king-in-check highlight
- `CapturedPieces` optional (can be deferred to v4)

**How to test**
- Component tests for:
  - correct orientation mapping
  - click a piece → legal squares are highlighted

---

### Step 9 — Move input UX (tap and drag-drop) + promotion chooser
**Goal:** Allow users to execute moves naturally and prevent illegal actions.

**Deliverables**
- Tap-select-tap move input:
  - first tap selects own piece
  - second tap attempts move (only if in legal moves)
  - invalid attempts show brief message (“Illegal move” / “King would be in check”)
- Drag-and-drop support (desktop-friendly):
  - drag piece → drop on square
  - revert if illegal
- Promotion UI:
  - when a pawn reaches last rank, show modal/picker for Q/R/B/N
  - commit move only after choice

**How to test**
- UI tests for:
  - selecting piece shows legal moves
  - illegal move cannot be committed
  - promotion requires choosing a piece

---

### Step 10 — Local game controls + result screen (complete journey 6.1)
**Goal:** Finish the local journey from start to end with basic controls.

**Deliverables**
- In-game controls:
  - **Resign** (immediately ends game with winner)
  - **Offer draw** (local mode: can be immediate accept via confirm dialog)
  - **Restart** (new local game with same settings)
  - **Back to Home**
- Result modal/screen:
  - shows outcome (checkmate/stalemate/draw/resign)
  - shows winner when applicable

**How to test**
- Manual: play through a checkmate and see result
- Automated: smoke tests for controls rendering and state transitions

---

### Step 11 — Time control (local clocks) aligned with setup screen
**Goal:** Implement optional clocks for local play (needed for the “choose time control” part of 6.1).

**Deliverables**
- Time control presets from setup page:
  - “No clock”
  - “5+0”, “3+2”, “10+5” (initial minutes + increment seconds)
- Local clock behavior:
  - active clock decreases when it’s your turn
  - on move commit: apply increment to player who just moved, then switch active side
  - pause clock when game ends
- Timeout handling:
  - if a side hits zero: game ends with timeout loss  
  *(v1 may ignore special “insufficient mating material on time”; can be added in v4 polish)*

**How to test**
- Manual: short clock (e.g., 0:10) to verify flag fall
- Unit tests for clock tick + switch logic (pure functions where possible)

---

### Step 12 — PWA polish + CI gates
**Goal:** Make it feel like a proper PWA and keep the repo healthy for v2–v4.

**Deliverables**
- PWA:
  - manifest (name, icons, theme colors)
  - offline caching for static assets
- CI:
  - run tests on PRs
  - build verification
- Basic responsive layout:
  - board scales to phone/iPad/desktop
  - controls accessible on small screens

**How to test**
- `npm run build` + `npm run preview`
- Installable PWA on mobile (Add to Home Screen)
- CI passes on GitHub

---

## Suggested repo structure (stable across v1–v4)
```
pwa-game-chess/
  src/
    domain/
      types/
      rules/
      game/
      clocks/
      notation/        (stub for v4)
      ai/              (stub for v2)
      online/          (stub for v3)
    pages/
      HomePage.tsx
      LocalSetupPage.tsx
      GamePage.tsx
    ui/
      ChessBoard/
      PromotionPicker/
      GameControls/
    app/
      router.tsx
      App.tsx
  public/
    icons/
```

---

## What’s intentionally deferred to later versions
- **v2 (vs computer):** engine integration + difficulty settings + hint API
- **v3 (online):** auth, matchmaking, sync, reconnection, authoritative clocks
- **v4 (review):** move list UI, SAN/PGN, rewind/jump, export/import
