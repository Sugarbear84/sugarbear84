# Coolbreeze interface — upgrade plan

**Status: PROPOSED — nothing here lands on the live system without the operator's explicit approval, per the Coolbreeze operating contract (plan first, one task per session, `npm run verify` before any commit, operator reads the diff).**

## What was built (this repo, branch `claude/coolbreeze-interface-design-233ba7`)

The Coolbreeze Deck design (Claude Design project "Trading platform UI wireframes",
file `Coolbreeze Deck.dc.html`, last edited 2026-08-31) implemented as a real,
runnable interface:

- `src/ui/public/` — vanilla JS front-end, **no framework and no build step**
  (an explicit constraint from the design project's IA proposal). Five surfaces:
  Deck, Analytics, Journal (with the Reporting module, per the operator's
  design iteration), Risk, and Config/Loadout behind the gear. Plus the health
  rail, halt banner, manual-trade dock with hold-to-confirm review, agent chat
  dock, ⌘K command palette, toasts, and the Player's guide glossary.
- `src/ui/public/themes.js` — all nine cabinet themes × light/dark, ported
  verbatim from the deck. Theme choice persists in `localStorage` (`cb-theme-v2`).
- `src/ui/server.ts` — thin Express server (port 3001 by convention;
  `UI_PORT`/`PORT` override) serving the static front-end and a small JSON API.
- `src/ui/bot-adapter.ts` — the seam that makes this "the interface for
  Coolbreeze **and other bots**": a `BotAdapter` interface plus a `DemoAdapter`
  carrying the deck's dataset so the UI runs standalone. All derived analytics
  (equity curve, drawdown, tier scorecard, regime win rates, weekly stacks) are
  computed client-side from the raw snapshot, so adapters stay thin.

### Design decisions carried from the project files, beyond the deck itself

- **Unknown / stale / degraded / halted vocabulary** (IA proposal §5.2–5.3):
  em-dashes for values never received (never a numeral); values older than 60s
  desaturate and gain a counting `◷ Xm OLD` chip; a `⚠ NO FEED` rail badge when
  the poll fails; none of these use colour alone.
- **Typed confirmation to clear a halt** (deck's own Player's guide: "Clearing a
  halt requires typed confirmation"): the Resume path opens a modal requiring
  the word CLEAR, and the **server** rejects a resume without it — a halt never
  clears from a bare click. Halting itself stays one click (safety actions are
  never gated).
- **Money buttons stay outline-only until the review step**; the review is
  hold-to-confirm (800 ms); numbers never tween; `prefers-reduced-motion`
  zeroes all transitions.

### Verified in this session (demo adapter, local browser)

All five pages render and interact; halt → banner/badge/toast; bare-click
resume rejected server-side, typed CLEAR resumes; hold-to-confirm executes a
demo trade end-to-end (fill bar, position appears, trade count increments);
param staging → amber pips + diff chips → apply round-trips; roster add/remove;
tier picker and 3-way comparison; journal drill-down and raw reasoning; ⌘K
palette with live filtering; chat round-trip with action buttons; Galaga dark +
Instrument light; stale/no-feed rendering. Not exercised: the 10s timer that
flips the stale boundary organically (rendered path was exercised by forcing
the state).

## Where it goes: the live droplet

Live trading runs on the droplet (`/root/coolbreeze`, systemd, four units); the
canonical UI today is the Express UI on **port 3001** (`src/ui/server.ts` +
`src/ui/public/index.html` in the live repo), reached through the operator's
SSH tunnel (`Coolbreeze-Dashboard.command`) with `UI_AUTH_TOKEN`. This
implementation is shaped to drop into that same slot.

### Step 0 — operator ratifies scope (required first)

Open questions the operator decides before any build lands:

1. **"Since your last visit" band** — designed in the IA proposal (§5.1) but
   absent from the final deck. Build it, or drop it? (It needs an event feed
   with read-cursors — real work, not a render.)
2. **Chat wiring** — the deck's chat is a designed surface; the demo serves
   canned replies. Real wiring means an Anthropic API call server-side with
   read-only access to ledger/journal/params, and chat-staged trades still
   going through the same review modal. Which key, and is the quota acceptable?
3. **Roster edits** — the UI can add/remove tier assets, but the live
   convention is `npm run wire-token` (CoinGecko + on-chain verification).
   Recommendation: UI "add" queues a wire-token request for the operator
   rather than writing `config/assets.json` blind.
4. **Presets (CAUTIOUS/STANDARD/AGGRESSIVE)** and the **Difficulty numbers** —
   the demo values came from the deck's mock. Live values must be measured
   against the real params file, not carried over.

### Step 1 — LiveAdapter (the only new live code)

Implement `LiveAdapter` next to `DemoAdapter`, mapping the snapshot fields to
the live sources already on the droplet:

| Snapshot field | Live source |
|---|---|
| `positions`, `ledger` | `live-ledger.json` (read-only) |
| `params` | the live params/config the current UI already edits |
| `journal` | analyst/tier cycle outputs (whatever the current UI's journal reads) |
| `riskLog` | monitor's 60s check history |
| `halted`, `haltReason` | risk monitor state + its halt/resume controls |
| `prices`, `directives`, `tierStates` | shared price cache + last directives |
| `equityRanges`, `mtm` | ledger history (compute server-side once per poll) |
| `trade()` | the **existing** `/api/manual-trade` path, unchanged semantics |
| `resume(confirm)` | existing resume path, now requiring the typed word |

Rules that bind this step: never let a test or a session touch the real
ledger; never probe `/api/manual-trade` with a real request from a session
(that moved real money on 2026-08-02); absolute thresholds must state which
account they were measured on.

### Step 2 — stage side-by-side, then swap

1. Build in the dev clone (`~/trading-agent-dev`), `npm run verify` with output
   shown, operator reads the diff. Land dev → live tree → GitHub.
2. On the droplet, run the new UI as a **second** service on port 3002 behind
   the same loopback + token, reached via the same tunnel with a second `-L`.
   The old UI keeps serving 3001. No trading-path process restarts.
3. Operator clicks through the staging UI against live data for as long as
   they like (suggest ≥48h, matching the cutover watch-window habit).
4. Swap: point the `ui` unit at the new server on 3001, retire the old one.
   Rollback is the reverse — the old UI stays on disk untouched.

### Step 3 — other bots

A second bot (see `NEW_BOT_HANDOFF.md`) mounts as another `BotAdapter` in the
same server: the `/api/ui/*` endpoints already take a `?bot=` parameter and
`/api/ui/bots` lists what's mounted. The front-end needs only a bot switcher
in the health rail (small, additive). One UI, N books — but **one wallet per
bot** stays the rule; the adapter seam must never let two bots share a book.

## Explicitly out of scope for the swap

- Any change to trading logic, cadence, risk gates, or the four systemd units
  other than `ui`.
- Wallet, key, or `.env` handling beyond reusing the existing `UI_AUTH_TOKEN`.
- The adaptive band equation (Task D) and asset-list revision — separate tasks.
