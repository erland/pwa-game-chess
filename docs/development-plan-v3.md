# Development plan (v3) — Play online (real-time) (User Journey 6.3)
Repository: **pwa-game-chess**  
Prerequisite: **Version 1** (Local) and **Version 2** (vs Computer) are implemented and stable.

This is **Version 3** of the development plan. It adds **real-time online multiplayer** while preserving architecture for:
- **v4:** Review finished game (6.4)

---

## Scope of v3
Implement **User Journey 6.3 — Play online (real-time)**:

1. User selects **Play → Online**
2. User selects time control + matchmaking type (ranked/unranked; ranked can be stubbed)
3. System finds an opponent and starts the game
4. Moves are synchronized in real time with correct rule enforcement and clocks
5. System handles reconnection and records the result

### Non-goals for v3 (deferred)
- Full rating system, leaderboards, tournaments (can be v3.1+)
- Friends/follow, chat, moderation (optional later)
- Deep anti-cheat (basic safety only in v3)
- Full review/PGN export/import UI (v4)

---

## Architectural approach (keeps v4 easy)
### Core principles
- **Server-authoritative match state**:
  - Clients never “decide” the official result/time.
  - Client submits *intent* (a move); server validates and commits.
- **Keep domain reducer authoritative on both ends**:
  - Reuse the same `applyMove`, `generateLegalMoves`, `getGameStatus`.
  - Server rejects invalid moves, even if the client UI allowed it due to desync.
- **Serializable GameState** remains the single source of truth for:
  - persistence / resume
  - audit trail
  - future review mode (v4)

### Backend assumption (recommended)
Because GitHub Pages is static hosting, online play requires an external backend. A good default for this project is:
- **Supabase** (Auth + Postgres + Realtime)  
- **Edge Functions** for server-authoritative move validation and clock updates

*(If you prefer Firebase/Firestore or a custom WebSocket server, the plan’s interfaces still apply; only implementation details change.)*

---

## Data model (minimal for v3)
- **users**: id, handle/displayName, createdAt
- **matches**: id, status (waiting/active/finished), timeControl, createdAt, startedAt, finishedAt
- **match_players**: matchId, userId, color (w/b), seat (player1/player2), joinedAt
- **match_state** (or column on matches): current FEN / serialized GameState, activeColor, lastMoveAt, clocks
- **match_moves**: matchId, ply, move (from/to/promo), serverTimestamp, resultingFEN (or resulting hash)

Keep `match_moves` even if you also store the latest `match_state`, because it makes:
- auditing,
- desync recovery,
- and v4 review
much easier.

---

## Online message protocol (conceptual)
- **Client → Server**
  - `requestMatch(timeControl, queueType)`
  - `submitMove(matchId, move, clientRevision)`
  - `resign(matchId)`
  - `offerDraw(matchId)` / `respondDraw(matchId, accept)`
  - `ping(matchId)` *(optional heartbeat)*

- **Server → Client**
  - `matchFound(matchId, yourColor, opponent)`
  - `stateUpdate(matchId, state, clocks, revision)`
  - `moveRejected(matchId, reason, authoritativeState)`
  - `matchEnded(matchId, result, termination)`

This protocol can be implemented via Realtime subscriptions + RPC/Edge Functions.

---

## Steps (each step is realistic to implement in one prompt)

### Step 1 — Online mode entry point + gating
**Goal:** Add Online as a first-class mode without breaking v1/v2.

**Deliverables**
- Home action: **Play → Online**
- Online setup UI:
  - Time control presets (reuse v1)
  - Queue type: **Unranked** (ranked can be “coming later”)
- Add `GameMode = 'local' | 'vsComputer' | 'online'`
- Add a shared `GameSessionId` concept to the UI container (local uses generated id; online uses backend match id)

**How to test**
- UI navigation works
- online mode shows setup page even if not logged in

---

### Step 2 — Authentication (minimal but complete)
**Goal:** Online play requires identity. Implement sign-in with a simple UX.

**Deliverables**
- Auth screens:
  - Sign in / Sign up
  - Sign out
- User profile basics:
  - display name / handle
- App-level auth guard:
  - Online mode requires login; local/vs-computer do not

**How to test**
- Manual: sign up, sign in/out
- Integration test: online route redirects to login when unauthenticated

---

### Step 3 — Backend schema + client API wrapper
**Goal:** Create stable storage primitives for matchmaking and match state.

**Deliverables**
- Database tables (as per “Data model” above)
- Client-side API module:
  - `createOrJoinQueue(timeControl, queueType)`
  - `subscribeToMatch(matchId, onUpdate)`
  - `submitMove(matchId, move, revision)`
  - `resign(matchId)`
  - `offerDraw/respondDraw`
- A “revision” integer on match state:
  - increments on every committed server update
  - prevents clients applying stale state updates

**How to test**
- Scripted/manual: create a match row and subscribe to updates
- Unit tests for API wrapper shape (mocked calls)

---

### Step 4 — Matchmaking (basic queue → match pairing)
**Goal:** Two players selecting the same queue get paired into a match.

**Deliverables**
- Queue logic (unranked):
  - player requests matchmaking with a time control
  - server pairs two waiting players and creates an active match
  - both players receive `matchFound`
- UI:
  - “Searching for opponent…” screen
  - Cancel search

**How to test**
- Manual with two browser sessions:
  - both join queue → match found
- Edge test: cancel search removes user from queue

---

### Step 5 — Server-authoritative move validation + commit
**Goal:** Make the server the source of truth for legal moves and state transitions.

**Deliverables**
- Server move-commit function (Edge Function / RPC):
  - loads authoritative match state
  - validates it’s the caller’s turn
  - validates move is legal using domain engine
  - applies move (domain reducer)
  - updates match state + appends to match_moves
  - increments revision
  - broadcasts update (realtime)
- Client behavior:
  - optimistic UI optional, but must reconcile with server update
  - on rejection: show reason + snap back to authoritative state

**How to test**
- Unit tests (server side):
  - illegal move rejected
  - wrong-turn rejected
  - legal move committed and revision incremented
- Manual: two clients see move updates immediately

---

### Step 6 — Authoritative clocks (online time controls)
**Goal:** Ensure clocks stay consistent and cannot be cheated by client-side time.

**Recommended model**
- Store on server:
  - `whiteRemainingMs`, `blackRemainingMs`
  - `activeColor`
  - `lastMoveAt` (server timestamp)
- On server move commit:
  - compute elapsed time since `lastMoveAt`
  - subtract from the active side’s remaining time
  - add increment to the mover (if applicable)
  - switch activeColor, set new lastMoveAt
- On clients:
  - render countdown locally using:
    - last server state
    - a measured server-time offset (simple ping-based calibration) or periodic sync
  - never commit results based solely on client timer

**Deliverables**
- Clock calculations in the server commit function
- Client countdown display using the authoritative state
- Timeout handling:
  - server detects flag fall on a move submission and/or periodic server check
  - match ends with timeout result (v3 can omit “insufficient mating material on time”; add later if desired)

**How to test**
- Manual: very short time control (e.g., 0:10) to force flag fall
- Server unit test: elapsed time subtraction and increment

---

### Step 7 — Reconnection + desync recovery
**Goal:** Online games survive refreshes and transient network loss.

**Deliverables**
- When opening an active match:
  - client fetches latest match state and subscribes to realtime updates
- Reconnect UX:
  - “Reconnecting…” banner
  - if subscription drops, retry with backoff
- Desync handling:
  - if client receives an update with a revision gap, refetch the latest state
  - if client submits a move with stale revision, server rejects with authoritative state

**How to test**
- Manual:
  - refresh one client mid-game → it resumes correctly
  - temporarily go offline → reconnect → state is correct

---

### Step 8 — Online-specific game controls (resign, draw offer) + end-of-match recording
**Goal:** Complete the online journey with proper termination reasons.

**Deliverables**
- Resign:
  - server marks match finished, records result and termination reason
- Draw offer:
  - server stores a pending draw offer state
  - opponent can accept/decline
- End screen:
  - result (win/loss/draw), reason (mate/stalemate/resign/draw/timeout)
- History recording:
  - match row marked finished
  - moves preserved for v4 review

**How to test**
- Manual: resign ends match for both clients
- Manual: draw offer accepted ends match for both clients

---

### Step 9 — Online hardening: abuse prevention + basic observability
**Goal:** Prevent obvious abuse and make debugging feasible.

**Deliverables**
- Rate limiting on move submission (basic per-user throttling)
- Authorization checks:
  - only match participants can submit moves
  - only current side-to-move can submit a move
- Logging:
  - move rejections, revision mismatches, errors
- Client UX polish:
  - clear errors when opponent disconnects too long (optional grace policy)

**How to test**
- Attempt submitting moves from a non-participant user → rejected
- Rapid submissions → throttled

---

### Step 10 — CI + local dev workflow for online mode
**Goal:** Make v3 maintainable and safe to evolve into v4.

**Deliverables**
- Test suites:
  - server-side unit tests for move commit + clocks
  - client integration smoke test for online flow (mock server)
- Dev tooling:
  - local environment variables setup (supabase url/key placeholders)
  - “run locally” instructions
- Regression gates:
  - v1 local and v2 vs-computer flows still pass

**How to test**
- CI runs tests and builds successfully
- Manual: still deploys to GitHub Pages without leaking secrets (use public keys appropriately)

---

## Acceptance tests (examples for v3)
- **AT3-001** Two users join same unranked queue → match is created and both receive a match id.
- **AT3-002** A legal move submitted by the current player updates both clients in real time.
- **AT3-003** An illegal move is rejected and the client snaps back to authoritative state.
- **AT3-004** Refresh/reconnect restores the match state and clocks correctly.
- **AT3-005** Timeout is enforced by server-authoritative clock rules.
- **AT3-006** Resign and draw agreement end the match for both players and are recorded.

---

## Suggested folder additions
```
src/
  domain/
    online/
      types.ts                 # DTOs / protocol shapes
      validation.ts            # shared guards if needed
  app/
    auth/
    api/
      onlineClient.ts
  pages/
    OnlineSetupPage.tsx
    MatchmakingPage.tsx
    OnlineGamePage.tsx
```

---

## Notes for v4 (Review finished game)
v3 should intentionally preserve:
- `match_moves` as an append-only move log
- `result`, `terminationReason`, `timeControl`, and player identities on the match
- optional “resultingFEN” per move (or at least the ability to reconstruct)

That makes v4 review straightforward:
- load match + moves
- replay moves using the same domain engine
- add PGN export/import and navigation UI

