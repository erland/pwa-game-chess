# Development plan (v4) — Play online (real-time) (User Journey 6.3)
Repository: **pwa-game-chess**  
Prerequisite: **v1 (Local)**, **v2 (vs Computer)**, and **v3 (Review + History, backend-free)** are implemented and stable.

This rewritten **Version 4** plan focuses on delivering **6.3 Play online (real-time)**. It assumes v3 already provides:
- a unified `GameRecord` / move log model
- history UI + review UI
- PGN/FEN export/import

Online play will reuse those primitives so finished online games automatically appear in **History** and open in **Review**.

---

## Scope of v4 (maps to specification 6.3 + FR-080…FR-085)
Implement **User Journey 6.3 — Play online (real-time)**:

1. User selects **Play → Online**
2. User selects time control and matchmaking type (ranked/unranked; ranked may be stubbed initially)
3. System finds an opponent and starts the game
4. Moves are synchronized reliably in real time and clocks stay consistent
5. System records result and stores the game so it can be reviewed via v3

### Non-goals for v4 (deferred)
- Ratings/leaderboards/tournaments (can be v4.1+)
- Chat/friends/moderation (optional later)
- Deep anti-cheat (basic safety only)

---

## Architectural approach
### Core principle: **server-authoritative match state**
- Clients submit a **move intent**.
- Server validates legality and commits the move.
- Server owns the official clocks + game termination (timeout, resign, draw).

### Compatibility with v3 review/history
Online storage should naturally map to v3’s `GameRecord`:
- store an **append-only move log**
- store final result + termination reason
- store minimal metadata (players, time control, timestamps)
So the client can fetch a finished match and open it using the existing v3 ReviewPage.

---

## Backend requirement (reality check)
GitHub Pages is static hosting, so **real-time online play requires an external backend** (WebSocket/realtime DB + auth + persistence).
This plan is backend-agnostic:
- Supabase, Firebase, Cloudflare Durable Objects, a small Node WebSocket server, etc.
The key is preserving the same interfaces and data contracts.

---

## Minimal online data model (conceptual)
- `matches`: id, status (waiting/active/finished), timeControl, createdAt, startedAt, finishedAt
- `match_players`: matchId, userId, color, joinedAt
- `match_state`: matchId, authoritativeState (or FEN), revision, clocks, lastMoveAt
- `match_moves`: matchId, ply, move (from/to/promo), serverTimestamp, optional resultingFen
- `users`: id, handle/displayName

Keep `match_moves` even if you store the latest state; it enables:
- deterministic replay (v3)
- desync recovery
- auditability

---

## Steps (each step is realistic to implement in one sweep)

### Step 1 — Online mode entry + client API boundaries
**Goal:** Add Online as a first-class mode without breaking v1–v3.

**Deliverables**
- Add `GameMode = 'local' | 'vsComputer' | 'online'`
- Add `OnlineSetupPage`:
  - time control presets
  - queue type: **Unranked** (ranked can be “coming later”)
- Add a client “online API” module (interface-first):
  - `requestMatch(timeControl, queueType)`
  - `subscribe(matchId, onUpdate)`
  - `submitMove(matchId, move, revision)`
  - `resign(matchId)`
  - `offerDraw(matchId)` / `respondDraw(matchId, accept)`

**How to test**
- App navigation works and online setup page renders

---

### Step 2 — Authentication (minimal viable)
**Goal:** Online play needs identity; local/vs-computer should remain guest-friendly.

**Deliverables**
- Auth screens (sign in/up/out)
- Route guard:
  - Online mode requires auth
  - Local/vs-computer/history/review remain available offline

**How to test**
- Unauthenticated user entering Online is redirected to login

---

### Step 3 — Matchmaking queue → match creation
**Goal:** Two players joining the same queue get paired.

**Deliverables**
- Backend queue logic:
  - join queue for (timeControl, queueType)
  - pair two waiting users → create match + assign colors
- Client UX:
  - “Searching for opponent…”
  - Cancel search

**How to test**
- Two browser sessions join queue → both receive match id and opponent

---

### Step 4 — Server-authoritative move validation + commit
**Goal:** Prevent illegal moves and keep clients in sync deterministically.

**Deliverables**
- Backend move commit endpoint:
  - load authoritative match state
  - verify caller is a participant + correct side-to-move
  - validate move legality using the same chess rules logic (or an equivalent server implementation)
  - apply move → update state + append to match_moves
  - increment `revision`
  - broadcast update to both clients
- Client behavior:
  - apply server updates as the source of truth
  - if optimistic UI is used, reconcile on server update/rejection

**How to test**
- Illegal move is rejected; both clients remain consistent
- Legal move appears on both clients in real time

---

### Step 5 — Authoritative clocks (time controls + increment)
**Goal:** Ensure clocks are consistent and not client-cheatable.

**Deliverables**
- Server stores:
  - `whiteRemainingMs`, `blackRemainingMs`, `activeColor`, `lastMoveAt`
- On move commit:
  - subtract elapsed time since `lastMoveAt` from active side
  - apply increment to the mover (if applicable)
  - switch activeColor, update `lastMoveAt`
- Timeout result is decided on server and broadcast.

**How to test**
- Very short time control triggers timeout and both clients end consistently

---

### Step 6 — Reconnection + desync recovery
**Goal:** Online games survive refresh/network loss (FR-083).

**Deliverables**
- On game load:
  - fetch latest match state + subscribe to updates
- Reconnect UX banner (“Reconnecting…”)
- Revision gap handling:
  - if client detects missed revisions → refetch latest state

**How to test**
- Refresh one client mid-game → it resumes with correct clocks and position

---

### Step 7 — Online controls: resign + draw offer + end-of-match
**Goal:** Finish games cleanly (FR-004/FR-005/FR-084).

**Deliverables**
- Resign endpoint → marks match finished and broadcasts result
- Draw offer state + accept/decline flow
- End screen shows:
  - result (win/loss/draw) + reason (mate/stalemate/resign/draw/timeout)

**How to test**
- Resign ends match for both clients
- Draw accepted ends match for both clients

---

### Step 8 — Store finished online games and surface in History/Review (v3 reuse)
**Goal:** Online games become reviewable using the already-built v3 features.

**Deliverables**
- Backend marks match finished + preserves `match_moves`
- Client “History” integrates:
  - fetch finished matches
  - map to `GameRecord` and list alongside local games
- Opening an online history item launches the existing `ReviewPage` (v3) by loading match + moves.

**How to test**
- Finish an online match → it appears in History → Review works with move navigation + PGN/FEN export

---

### Step 9 — Security + abuse prevention (basic)
**Goal:** Reduce obvious abuse and improve reliability.

**Deliverables**
- Authorization checks:
  - only match participants can submit moves
- Basic throttling/rate limiting
- Logging for:
  - rejected moves, revision mismatches, unexpected errors

**How to test**
- Non-participant cannot submit moves; spam submissions are throttled

---

### Step 10 — CI + local dev workflow for online module
**Goal:** Keep v4 maintainable and prevent regressions.

**Deliverables**
- Backend unit tests:
  - move commit legality + clocks
- Client tests:
  - online flow smoke tests (mock backend)
- Local dev instructions for environment variables and running backend locally (or pointing to a dev instance)

**How to test**
- `npm test` + `npm run build` pass in CI
- App deploys to GitHub Pages without secrets leakage

---

## Acceptance tests (examples)
- **AT4-001** Two logged-in users join the same queue and are matched.
- **AT4-002** A committed move appears on both clients in real time; illegal moves are rejected.
- **AT4-003** Clocks are server-authoritative and timeouts end the match consistently.
- **AT4-004** Refresh/reconnect restores state and clocks correctly.
- **AT4-005** Finished online games appear in History and open in Review with full navigation + export.

---

## Suggested folder additions
```
src/
  app/
    auth/
    api/
      onlineClient.ts
  pages/
    OnlineSetupPage.tsx
    MatchmakingPage.tsx
    OnlineGamePage.tsx
  domain/
    online/
      types.ts
```
