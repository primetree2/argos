# ARGOS — Master Roadmap, Scaling & Monetization Plan

> **Purpose of this file.** This is the single source of truth for *where Argos goes next*.
> It is written so that **any AI agent or developer** can pick it up cold, understand the
> current state, and continue the work without re-analyzing the whole codebase.
>
> `PROJECT.md` describes how things were *built* (and is partly stale — see note below).
> This file describes what to build *next* and *why*, split into phases, and split into
> **what you can do for free right now** vs **what needs money later**.
>
> **Read this first, then `README.md`, then `PROJECT.md`.**

---

## 0. Document status & ground truth

- **Last verified against `main`:** all of the Phase 1 + Phase 2 work described in
  `PROJECT.md` (public feed, challenges lobby, ranked matchmaking, daily topic,
  argument reactions, auto-forfeit, turn emails) **is already merged.** The old
  `PROJECT.md` "7 stacked MRs awaiting merge" section is **out of date** — ignore it.
- **Cron reality:** `vercel.json` now runs **two daily crons** (`/api/cron/daily-topic`
  at `0 0 * * *`, `/api/cron/maintenance` at `30 0 * * *`). Near-real-time turn
  timeouts are driven by a **GitHub Actions workflow** (`.github/workflows/maintenance-cron.yml`)
  hitting `/api/cron/maintenance` every 5 min. This is the *free* workaround for Vercel
  Hobby's 2-cron/daily limit. The README is the accurate description here, not `PROJECT.md`.
- **Paid services currently in use:** *none beyond Gemini.* Everything else (Supabase,
  Vercel, Resend, Sentry, Posthog, GitHub Actions) is on a **free tier**. Every "FREE"
  task below is designed to stay inside those free tiers.

---

## 1. What Argos is (one paragraph)

Argos is a competitive, turn-based, **AI-judged debate platform** — "chess.com for debate."
Two players argue opposing sides (FOR / AGAINST) of a topic across 2–5 rounds with a
10-minute timer per turn. After each argument, Google Gemini scores it across 5 dimensions
(Clarity, Evidence, Logic, Rebuttal, minus a Fallacy penalty, max 80) and names every
logical fallacy it finds with the offending quote. Players gain/lose an **Elo rating**.
The shareable scorecard is the viral loop. Live at `argos-indol.vercel.app`.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 + custom "Oracle Terminal"
design system · shadcn/ui · Supabase (Postgres + Realtime + Auth/Google OAuth) · Drizzle ORM
· Gemini (`gemini-3.1-flash-lite`, fallback `gemini-2.5-flash-lite`) · Resend (email) ·
Sentry + Posthog · Vercel + Vercel Cron + GitHub Actions cron.

---

## 2. Honest assessment (the why behind the roadmap)

### 2.1 Strengths (keep these, don't regress)
- **Genuinely solid backend.** Atomic SQL functions (`submit_argument`, `match_player`)
  using `FOR UPDATE SKIP LOCKED` make submission and matchmaking race-safe.
- **Trustworthy scoring.** The LLM is never trusted for arithmetic — `normalizeScore()`
  clamps every dimension and recomputes `total` server-side. Winner determination is
  authoritative.
- **Resilient AI layer.** 3 retries + timeout + fallback model; failed scores are terminal
  (count as 0) so debates never hang. AI is isolated to `lib/ai/judge.ts` + `prompts.ts`,
  so swapping providers is a one-file change.
- **Idempotent finalization.** Elo settlement is guarded so concurrent final scores can't
  double-apply ratings.

### 2.2 Drawbacks / risks (this is what the phases fix)
| Area | Problem | Severity |
|------|---------|----------|
| **Scaling** | Scoring is **synchronous** inside the submit request (`await fetch(/api/score)` → `await scoreArgument()`, up to 30s × 3 retries). Ties up serverless time & Gemini quota per submission. First bottleneck under load. | HIGH |
| **Scaling** | No job queue. No async worker. | HIGH |
| **Scaling** | Matchmaking is queue + 4s poll, **not presence-based**. "Omegle-style" instant pairing of *online* users isn't possible yet. | HIGH |
| **Scaling** | DB indexes are documented in `PROJECT.md` §5 but **may not be applied**. Verify and apply. | MED |
| **Cost/Scaling** | Every argument = 1 Gemini call. Free tier has a hard ceiling; this is also the core unit-economics problem. | HIGH |
| **Security** | Moderation is a **6-word regex** (`lib/moderation.ts`). Wholly inadequate for public UGC between strangers (hate speech, harassment, spam, doxxing). | HIGH |
| **Security** | No report/block/mute. No Sybil/alt-account protection — Elo farming via two accounts is trivial. | HIGH |
| **Security** | Rate limiting exists only on debate creation (20/day). Scoring & matchmaking are unthrottled. | MED |
| **UX** | Turn-based + 10-min turns feels slow/async — opposite of instant-dopamine platforms. No fast mode. | MED |
| **UX** | No single-player on-ramp → cold-start problem (no opponent = no game). | HIGH |
| **UX** | No spectator / live-watch experience — the biggest missing growth & monetization lever. | HIGH |
| **UX** | Email only, no push/PWA. Target users live on mobile. | MED |
| **Code** | `DebateRoom.tsx` is ~771 lines. Maintainability debt. | LOW |

---

## 3. How to read the phases

Each phase has two tracks:
- 🟢 **FREE** — do now, no paid plan needed, stays inside current free tiers.
- 💰 **PAID** — do once you have some revenue/budget; each item notes the *cheapest realistic spend*.

Phases are ordered by leverage. Do the FREE track of each phase first; pull PAID items
forward only when money is available.

---

## 4. PHASE 1 — Foundation hardening & cold-start fix
> Goal: make the product safe, reliable, and *playable by one person*. This is the
> highest-leverage work and is almost entirely free.

### 🟢 FREE
1. **Apply the DB indexes.** Run the `CREATE INDEX` statements from `PROJECT.md` §5
   (`idx_debates_player_a`, `idx_debates_player_b`, `idx_debates_status`,
   `idx_arguments_debate`, `idx_users_elo`). Verify each exists in Supabase. *Cost: 0.*
2. **vs Oracle AI mode (cold-start killer).** Let a user debate Gemini itself when no
   human opponent is available. Gemini plays the opposing side; the same judge scores both.
   - Add a debate `mode` value or an `opponent_type` flag (`human` | `ai`).
   - Reuse `lib/ai/` — add an `argueAsOracle(topic, side, history)` function alongside
     `scoreArgument`. Keep it isolated like the judge.
   - This removes the "no opponent" dead-end entirely. **Single biggest free growth unlock.**
   - Note: doubles Gemini calls per debate (AI argues + AI judges). Gate AI debates per
     user per day to protect free Gemini quota (e.g. 3/day for non-Pro).
3. **Stronger moderation, still free.** Replace the 6-word regex with **Gemini's own
   safety / a dedicated moderation prompt** (you already have a Gemini key). Add a second
   cheap Gemini call (or reuse the judge response) that returns a safety verdict before an
   argument is accepted. *Cost: marginal Gemini usage, still free tier.*
4. **Report / block / mute (DB + UI).** Add a `reports` table and a `user_blocks` table.
   Add a "Report" button on arguments and a "Block" action on profiles. Hide blocked users
   from matchmaking and feed. *Cost: 0.*
5. **Basic anti-Sybil.** At minimum: rate-limit ranked matchmaking per user, and flag
   debates where both players share a signup IP / device fingerprint (store a hashed
   fingerprint on the user row). Don't ban automatically yet — just flag for review. *Cost: 0.*
6. **Rate limit scoring & matchmaking endpoints.** Add the same DB-backed rolling-window
   guard used in `app/api/debates/route.ts` to `/api/score` and `/api/matchmaking`. *Cost: 0.*
7. **Refactor `DebateRoom.tsx`** into hooks (`useDebateRealtime`, `useTurnTimer`,
   `useArgumentSubmit`) + sub-components. Pure maintainability; do it before adding
   spectator/live features on top. *Cost: 0.*

### 💰 PAID (when budget exists)
- **Real moderation API** (OpenAI Moderation is free; Google Perspective API free tier;
  Hive/Sightengine paid for images). Cheapest: stay on the free moderation APIs — only
  pay when volume forces it. *Realistic spend: $0–20/mo at small scale.*

---

## 5. PHASE 2 — Async scoring & true scaling
> Goal: survive many concurrent users. This is the change that lets Argos "run like a
> real platform."

### 🟢 FREE
1. **Decouple scoring from the request path.** Today `app/api/debates/[id]/argument/route.ts`
   awaits `/api/score`. Change it to: insert the argument (status `pending`), return
   **immediately**, and let scoring happen out-of-band. The UI already understands
   `scoring_status: pending`.
   - **Free queue option A (recommended):** a Postgres-backed queue. Insert a row into a
     `scoring_jobs` table; have the existing every-5-min GitHub Actions maintenance cron
     drain it (plus the existing client self-heal retry). No new paid service.
   - **Free queue option B:** **Supabase Edge Functions + `pg_cron`** (Supabase free tier
     includes both) to process the queue every minute. More real-time than GitHub Actions.
   - Keep the synchronous path as a fast-path fallback for low load if you want, but the
     default must be async.
2. **Add Supabase connection pooling.** Use the **Supavisor / pgBouncer** pooled connection
   string (free, built into Supabase) for all server routes. Connection exhaustion is the
   classic Postgres failure under concurrency. *Cost: 0.*
3. **Cache the hot read paths.** Leaderboard and public feed should use Next.js ISR /
   `revalidate` or edge caching instead of hitting Postgres on every view. Paginate the
   leaderboard and feed (noted as debt in `PROJECT.md` §11). *Cost: 0.*
4. **Gemini cost controls.** Cache identical/very-short arguments, batch where possible,
   and meter free users. Keep `gemini-flash-lite` as the judge. *Cost: 0.*

### 💰 PAID (when budget exists)
- **Vercel Pro (~$20/mo).** Unlocks real cron schedules (no 2/day limit), longer function
  timeouts, and concurrency headroom. This removes the GitHub-Actions-cron hack. **First
  paid upgrade to make.**
- **Dedicated job queue** — **Inngest** or **Upstash QStash** both have generous free tiers;
  upgrade only when the pg-queue can't keep up. *Realistic spend: $0 → ~$20/mo.*
- **Supabase Pro (~$25/mo).** More DB, more Realtime concurrent connections, daily backups,
  no project pausing. Needed once you have steady traffic. *Second paid upgrade.*

---

## 6. PHASE 3 — Virality & live experience
> Goal: turn debates into a spectacle people watch and share. This is where growth compounds.

### 🟢 FREE
1. **Live spectator mode.** Let anyone watch an in-progress debate read-only via Supabase
   Realtime (you already broadcast `debates` + `arguments`). Add a `/debate/[id]` spectator
   view that hides the input box for non-participants and shows a live viewer count
   (Realtime presence). *Cost: 0 within free Realtime limits.*
2. **Audience voting alongside the AI.** Spectators vote per round; show "Crowd 73% /
   Oracle P1". Store in a `spectator_votes` table. Huge engagement multiplier. *Cost: 0.*
3. **Blitz mode.** A debate mode with 60–90s turns instead of 10 min. This is your
   instant-dopamine / Omegle-style fast loop. Pairs perfectly with presence matchmaking
   (Phase 4). *Cost: 0.*
4. **Better viral share artifact.** You already generate an OG image (`/api/og`). Add a
   "debate recap" share card that highlights the score reveal + the best fallacy call-out.
   (Animated video clips are a PAID/later item — static first.) *Cost: 0.*
5. **Daily Topic global leaderboard.** You have the daily topic; add a per-topic leaderboard
   so there's a recurring reason to return and something to brag about. *Cost: 0.*
6. **Achievements / titles / badges** (`#9` in `PROJECT.md`) — Elo milestones + fallacy-free
   streaks on the profile. Cheap retention + share fuel. *Cost: 0.*
7. **Debate replay** (`#10`) — `/debate/[id]/replay` timeline view that scroll-animates the
   scores. Reuses existing data. *Cost: 0.*

### 💰 PAID (when budget exists)
- **Auto-generated highlight video/clips** for TikTok/Reels/X (e.g. Remotion render on a
  worker, or an API like Shotstack). The single best top-of-funnel artifact, but needs
  compute. *Realistic spend: render minutes, ~$10–30/mo at small scale.*
- **Web push notifications** infra (free via web-push standard; "paid" only if you use a
  managed service like OneSignal — which has a free tier). Prefer the free web-push first.

---

## 7. PHASE 4 — Real-time multiplayer at scale (Omegle / chess.com parity)
> Goal: instant pairing of online strangers, many concurrent live matches.

### 🟢 FREE
1. **Presence-based matchmaking.** Use **Supabase Realtime presence channels** to track who
   is *online right now*. Pair two live users instantly instead of queue+poll. Combine with
   Blitz mode (Phase 3) for the Omegle experience. *Cost: 0 within free Realtime concurrency.*
2. **Lobby with live online count + "Quick Match" button.** Show how many are online and
   waiting; one click drops you into a blitz debate. *Cost: 0.*
3. **Load test before launch.** Use a free tool (k6 OSS, Artillery free) to find the
   breaking point and tune pooling/caching. *Cost: 0.*

### 💰 PAID (when budget exists)
- **Supabase Pro / scale add-ons** for higher Realtime concurrent connection limits — this
  is the hard ceiling for "many simultaneous live matches." Upgrade when you hit it.
- **Dedicated Realtime / WebSocket service** (e.g. managed Ably/Pusher, or self-hosted)
  only if Supabase Realtime concurrency becomes the bottleneck. *Defer until proven needed.*
- **CDN / edge** for global low latency (Vercel already provides this; Pro improves it).

---

## 8. PHASE 5 — Monetization
> Goal: reach six figures. Stack multiple models; don't rely on a single $6 sub.
> Order matters: build the consumer funnel (Phases 1–4) *before* charging.

### 🟢 FREE (can build the plumbing now, charge later)
1. **Usage metering & free-tier limits** — the foundation of any paywall. Track ranked
   matches/day, AI debates/day, private rooms. You already meter debate creation; extend it.
   *Cost: 0.*
2. **"Pro" feature gating in code** — build features behind an `is_pro` boolean on the user
   row now (defaulting everyone to false-but-unlimited during beta), so flipping the paywall
   later is trivial. *Cost: 0.*

### 💰 PAID (each needs a payment processor)
Ranked by revenue density (highest first):

1. **Education / institutional licensing — HIGHEST VALUE.** Debate + critical thinking is a
   curriculum item. Build "Argos for Education": teacher dashboards, class leaderboards,
   rubric-aligned AI feedback, per-seat pricing. Sell to **university debate societies,
   schools, corporate L&D**. This is where five-to-six-figure contracts live — far denser
   than consumer subs.
2. **Debate Clubs / Teams (B2B + communities)** — paid private orgs with invite codes.
3. **Tournaments with entry fees + prize pool** — take a rake. High engagement, high
   willingness to pay, competitive prestige. (Check local rules on entry-fee competitions.)
4. **Argos Pro ($8–12/mo)** — unlimited ranked, unlimited vs-Oracle, AI coaching
   (post-match "how to improve"), private rooms, advanced stats / radar charts, replay
   analysis. Recurring base revenue.
5. **Scoring API as a product** — your `scoreArgument()` (clarity/evidence/logic/rebuttal +
   10 fallacy types) is useful standalone. Sell metered API access to other ed-tech / forum
   / moderation products.
6. **Spectator monetization** (after Phase 3) — sponsored topics, tipping debaters, ads.

**Tooling:** Stripe (no monthly fee, ~2.9% + 30c per transaction) or Lemon Squeezy
(merchant-of-record, handles tax — good for solo/global). *Cost: per-transaction only.*

**Six-figure path in one line:** consumer virality (free Phases 1–4) drives the funnel;
**Pro subs give volume; Education/Club licensing gives revenue density.** The institutional
side is what realistically gets you to six figures.

---

## 9. Suggested execution order (TL;DR for the next agent)

**Do these FREE items, in this order:**
1. Apply DB indexes (Phase 1).
2. Ship **vs Oracle AI mode** (Phase 1) — kills cold-start. *Highest growth-per-effort.*
3. Upgrade moderation to a Gemini safety pass + add report/block (Phase 1) — safety gate before any public growth push.
4. Make scoring **async** via a Postgres `scoring_jobs` queue drained by the existing cron (Phase 2) — *highest scaling-per-effort.*
5. Add Supavisor pooling + cache/paginate leaderboard & feed (Phase 2).
6. Ship **live spectator mode + audience voting + Blitz mode** (Phase 3) — virality.
7. Add **presence-based Quick Match** (Phase 4) — the Omegle loop.
8. Build metering + `is_pro` gating plumbing (Phase 5) so monetization is a flag-flip later.

**Then, as money arrives, in this order:**
1. **Vercel Pro (~$20/mo)** — fixes cron + timeouts + concurrency. First spend.
2. **Supabase Pro (~$25/mo)** — DB + Realtime headroom + backups. Second spend.
3. **Stripe/Lemon Squeezy** — turn on Pro subs + Education/Club licensing.
4. Job queue / highlight-video / scaled Realtime — only when usage proves they're needed.

---

## 10. Guardrails for any future agent

- **Respect the design system.** Every new page needs `<CircuitBackground intensity={1.0} />`
  + `<Navbar />`, a `loading.tsx` with `<OracleLoader />`, CSS variables only (no hardcoded
  colors), and the Cinzel/Crimson/Share-Tech font roles. See `PROJECT.md` §9–§10.
- **Keep the AI layer isolated** to `lib/ai/`. Provider swaps must not touch the rest of the app.
- **Never trust the LLM for numbers.** Keep `normalizeScore()` authoritative.
- **Keep all secrets server-side** (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`) — never in any `NEXT_PUBLIC_` var.
- **Stay race-safe.** New concurrent paths must follow the existing SQL-function +
  `FOR UPDATE SKIP LOCKED` / conditional-update pattern.
- **Every new feature: assume free tier first.** Only reach for a paid service when a free
  tier provably can't do the job.

---

*Document version: 1.0 — growth/scaling/monetization roadmap.*
*Companion docs: `README.md` (accurate build state + cron), `PROJECT.md` (build history, partly stale).*
