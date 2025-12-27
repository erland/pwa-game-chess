# PWA Chess — Training Feature (Development Plan)

This plan builds on the already implemented **v1–v3** foundation (board/play, vs-computer, and the current review/history capabilities).  
Goal: add a complete **Training** capability that helps users improve via **tactics, openings, endgames, guided lessons, and personalized practice**, with no backend required (optional future sync can be added later).

---

## Guiding principles

- **Offline-first:** training packs + progress stored locally (IndexedDB).
- **Composable modules:** “coach” evaluation, training session runner, and pack content are independent.
- **Deterministic UX:** training positions are reproducible; hint/analysis cancels cleanly; no stale async updates.
- **Testable steps:** each step adds shippable functionality with clear acceptance criteria.
- **Accessible UI:** keyboard support, ARIA labels, and color/contrast safe highlights.

---

## High-level architecture

### New domains
- `domain/training/`
  - Training pack schema, loaders, validators, and indexes
  - Session runner + result model
- `domain/coach/`
  - Engine-backed evaluation + PV extraction
  - Move grading + explanation helpers
  - Hint levels (progressive hints)
- `domain/openings/`
  - Opening tree model and move matching
  - Repertoire selection and drill sequencing

### New persistence
- `storage/training/`
  - Training progress store (IndexedDB)
  - Daily queue (spaced repetition)
  - Statistics aggregation

### New UI pages
- `pages/training/TrainingHomePage.tsx`
- `pages/training/TacticsTrainerPage.tsx`
- `pages/training/OpeningTrainerPage.tsx`
- `pages/training/EndgameTrainerPage.tsx`
- `pages/training/LessonPage.tsx`
- `pages/training/SessionSummaryPage.tsx`
- `pages/training/PacksPage.tsx` (browse/import/export)

### Reuse
- Use existing `ChessBoard` rendering & interaction.
- Reuse existing **hint** and **engine** infrastructure (worker adapter) where possible.

---

## Training content model (data formats)

### Training Pack (JSON, shipped in `public/training/packs/`)
**Minimum fields**
- `id`, `title`, `version`, `author`, `license`, `tags`
- `items[]` where each item is one of:
  - `tactic`
  - `openingLine`
  - `endgame`
  - `lesson`

**Common fields per item**
- `itemId`, `difficulty`, `themes[]`, `source?`, `notes?`
- `position`:
  - `fen`
  - `sideToMove` (derived or explicit)

**Solutions**
- `solutions[]` each with:
  - `mainlineSAN[]` (or UCI list)
  - `acceptableAlternatives[]` (optional)
  - `explanations[]` (short strings)

**Lessons**
- `blocks[]`: markdown text, diagrams (FEN), and “Try move” prompts

**Openings**
- `tree`: move tree where nodes include optional comments, evaluation, and typical plans

> Start with a single “Built-in” pack: `basic-training-pack.json` containing ~30 tactics, 1 opening line, and 3 endgames.

---

## Development plan (step-by-step)

### Step 1 — Foundations: routes, shell UI, and pack loading
**Work**
- Add `/training` route and navigation entry.
- Implement `TrainingHomePage` with “Tactics”, “Openings”, “Endgames”, “Lessons”, “Daily”.
- Implement pack discovery:
  - Load built-in packs from `public/training/packs/index.json`
  - Fetch pack JSON files; validate minimal schema; show errors gracefully.
- Add `domain/training/schema.ts` with runtime validation (lightweight) and TypeScript types.

**Acceptance criteria**
- App shows Training home and lists built-in packs.
- Invalid pack shows a friendly error, app still works.

**Tests**
- Unit tests for schema validator and pack loader.
- Smoke UI test for TrainingHomePage rendering.

---

### Step 2 — Training persistence: progress, stats, and daily queue (IndexedDB)
**Work**
- Add `storage/training/trainingStore.ts`:
  - per-item stats: attempts, successes, lastSeen, streak, average time
  - spaced repetition scheduling: `nextDueAt`, `interval`, `ease`
- Add “Daily training” queue (e.g., 10 items due + a few new).
- Create selectors for:
  - overall accuracy per theme
  - recent mistakes
  - time spent

**Acceptance criteria**
- Completing an item updates stats and schedules it.
- Daily queue returns deterministic items given store state.

**Tests**
- Unit tests for scheduling rules and store read/write.

---

### Step 3 — Coach layer v1: evaluation, PV, grading, and progressive hints
**Work**
- Implement `domain/coach/coach.ts`:
  - `analyzePosition(fen, constraints)` → { evalCp, bestMove, pvMoves[] }
  - `gradeMove(before, after)` → { label, deltaCp }
- Add `HintLevel`:
  1) theme nudge (“look for a fork/pin” if tagged)
  2) highlight candidate squares
  3) show arrow from-to (best move)
  4) show PV line (first N plies)
- Ensure async cancellation (abort token / requestId) so stale results are ignored.

**Acceptance criteria**
- Coach can evaluate a position within a fixed budget (e.g., 200–500ms).
- Hint requests show “calculating…” and resolve reliably; moving cancels hint.

**Tests**
- Unit tests for grading thresholds and stale-result cancellation.

---

### Step 4 — Tactics trainer v1 (single-move)
**Work**
- Create `TacticsTrainerPage`:
  - Pick item from selected pack or daily queue
  - Show goal text + board
  - User plays a move; validate legality
  - Compare to solution(s) (SAN/UCI match)
  - If wrong: show brief feedback + allow retry
  - Buttons: Hint, Show solution, Next
- Add “Solved” state with time and grade.

**Acceptance criteria**
- User can solve single-move tactics.
- Results are stored; daily queue advances.

**Tests**
- UI tests:
  - correct move marks solved
  - wrong move gives feedback
  - hint highlights squares

---

### Step 5 — Tactics trainer v2 (multi-move lines + opponent replies)
**Work**
- Support sequences:
  - After correct user move, trainer auto-plays opponent reply (from solution line)
  - Continue until line complete
- Allow alternative acceptable lines.
- Show move list (SAN) and “You are here” marker.

**Acceptance criteria**
- Multi-ply problems work end-to-end.
- If user deviates, coach can optionally evaluate and explain.

**Tests**
- Unit tests for line matching and progression.

---

### Step 6 — Session summary + mistakes review
**Work**
- Add `SessionSummaryPage`:
  - accuracy, time, streak, themes
  - “Review mistakes” button
- Add `MistakesReview` flow:
  - queue recent failures
  - reattempt with increased hint allowance

**Acceptance criteria**
- Completing a session produces a summary and a repeatable mistakes set.

---

### Step 7 — Opening trainer v1 (repertoire drill)
**Work**
- Opening pack format: move tree.
- Create `OpeningTrainerPage`:
  - Choose opening (e.g., “London”)
  - App plays opponent moves from the tree
  - User must play correct repertoire move
  - If wrong: show expected move + explanation; optionally rewind one ply and retry.
- Add settings:
  - side (white/black), randomness among branches, depth target

**Acceptance criteria**
- User can drill a short opening line with branching.
- Progress tracks which nodes are mastered.

**Tests**
- Unit tests for move-tree traversal and matching.
- UI test for wrong move feedback.

---

### Step 8 — Opening trainer v2 (spaced repetition on nodes)
**Work**
- Track mastery per opening node.
- Daily queue can include opening nodes due.
- “Weak spots” view for openings.

**Acceptance criteria**
- Openings appear in Daily training based on mastery and due date.

---

### Step 9 — Endgame trainer v1 (goal-based)
**Work**
- Add `EndgameTrainerPage`:
  - Start from FEN with a stated goal: “Win”, “Draw”, “Mate in N”
  - Coach monitors evaluation drift:
    - if you’re winning and eval drops, flag “inaccuracy/mistake”
  - Optional “key squares” hints from pack tags
- Add “Try again from key position” checkpoints.

**Acceptance criteria**
- User can practice endgames; feedback is based on eval and/or key moves.

**Tests**
- Unit tests for win/draw goal evaluation thresholds.

---

### Step 10 — Guided lessons (interactive lesson runner)
**Work**
- Add `LessonPage`:
  - Render markdown blocks (safe subset)
  - Diagram blocks render a board from FEN
  - “Try move” blocks require user action to proceed
  - Allow branching: if wrong, show hint or rewind
- Add “continue where I left off” progress.

**Acceptance criteria**
- Lessons can mix text + diagrams + interactive prompts.
- Progress persists across reload.

---

### Step 11 — Pack management: import/export and custom packs
**Work**
- Add `PacksPage`:
  - List installed packs
  - Import pack JSON (or zip) via file picker
  - Export your progress and installed packs (zip)
- Validate pack schema and show warnings.

**Acceptance criteria**
- User can import a pack without breaking the app.
- Export produces a file the app can re-import.

**Tests**
- Unit tests for import validation and pack registry.

---

### Step 12 — UX polish, accessibility, and performance
**Work**
- Keyboard navigation across trainer pages.
- Improve visuals:
  - distinct hint arrows + squares
  - color-blind-safe highlight modes
- Performance:
  - throttle analysis calls
  - use worker for heavy evaluations
  - cache evaluations by FEN
- Add settings:
  - analysis strength budget
  - hint behavior
  - board orientation for training

**Acceptance criteria**
- Smooth on mobile and desktop; no jank in training pages.
- WCAG-friendly contrast for highlights and pieces.

---

### Step 13 — Quality gates: CI, tests, and regression safety
**Work**
- Add integration tests for:
  - tactics solve flow
  - openings drill flow
  - lesson step advancement
- Add snapshot tests only where stable and useful.
- Ensure deterministic timers for hint/analysis tests.

**Acceptance criteria**
- `npm test` + `npm run build` green.
- Training pages covered by core tests.

---

## Suggested folder structure additions

```
src/
  domain/
    coach/
      analyze.ts
      grade.ts
      hint.ts
      index.ts
    training/
      schema.ts
      packs.ts
      session.ts
      index.ts
    openings/
      tree.ts
      drill.ts
  pages/
    training/
      TrainingHomePage.tsx
      TacticsTrainerPage.tsx
      OpeningTrainerPage.tsx
      EndgameTrainerPage.tsx
      LessonPage.tsx
      SessionSummaryPage.tsx
      PacksPage.tsx
  storage/
    training/
      trainingStore.ts
      scheduling.ts
public/
  training/
    packs/
      index.json
      basic-training-pack.json
```

---

## Engine / coach budget recommendations

- **Tactics hint:** 200–400ms per request (fast)
- **Move grading:** 200ms before/after or reuse cached eval
- **Endgame training:** allow 500–1200ms on demand (user-triggered)

Use request cancellation everywhere to avoid stale UI updates.

---

## Deliverables checklist (complete training feature)

- [ ] Training home with pack selection
- [ ] Built-in pack shipped with the app
- [ ] Tactics trainer (single + multi-move)
- [ ] Opening trainer with repertoire + spaced repetition
- [ ] Endgame trainer with evaluation-based feedback
- [ ] Guided lessons with interactive steps
- [ ] Coach: eval, grading, progressive hints
- [ ] Progress tracking + daily training queue
- [ ] Pack import/export
- [ ] Tests + CI safety
