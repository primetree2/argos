# ARGOS — Master Roadmap, Scaling & Monetization Plan

> **Purpose of this file.** This is the single source of truth for *where Argos goes next*.
> It is written so that **any AI agent or developer** can pick it up cold, understand the
> current state, and continue the work without re-analyzing the whole codebase.
>
> `PROJECT.md` file describes how things were *built* (and is partly stale — see note below).
> This file describes what to build *next* and *why*, split into phases, and split into
> **what you can do for free right now** vs **what needs money later**.
>
> **Read this first, then `README.md`, then `PROJECT.md`.**

---

## 0. Document status & ground truth

- **Build health:** the Vercel production type-check is green. A prior failure in
  `app/api/votes/route.ts` (implicit-`any` index of the per-round tally object) was fixed
  by narrowing the round + side into typed locals before indexing. No migration involved.
- **Security hardening (deep dive):** debate reads are now gated by visibility + participation
  in the app layer (`lib/debates/visibility.ts`, used by the server page and `GET /api/debates/[id]`)
  and at the DB layer (`migration 0012` SELECT policies on `debates`/`arguments`). A live
  opponent's in-flight argument is withheld until the viewer submits that round, and the public
  OG route no longer renders private debates. **Run `supabase/migrations/0012_debate_read_rls.sql`.**
- **Auth hardening:** the OAuth callback now validates `next` via `lib/auth/safeRedirect.ts`
  (same-site local paths only) to close an open-redirect; turn-notification emails skip the
  Oracle system user. No migration.
- **Client live-peek closed:** `DebateRoom` now redacts an opponent's in-flight argument
  (delivered via Realtime) until the viewer submits that round, mirroring the server guard.
  This completes the fairness fix begun server-side in the visibility pass. No migration.
- **Schema reproducibility:** `migration 0013` adds the `public_debate_feed` view that the
  `/debates` page depends on (previously created out-of-band). A fresh Supabase setup from
  this repo is now self-contained. **Run `supabase/migrations/0013_public_debate_feed.sql`.**
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
- **Migrations `0006`–`0008` status:** these are **applied and safe to keep** (and
  idempotent — safe to re-run). `0006` seeds the Oracle system user + `oracle_debates_today()`
  (now used by vs-Oracle mode). `0007` adds `reports` + `user_blocks` and makes
  matchmaking skip mutually-blocked users (no behaviour change until a block exists).
  `0008` adds `rate_limits` + `check_rate_limit()` and soft anti-Sybil flagging columns
  (additive, unused until wired). The app code that consumes `0007`/`0008` is the next
  FREE work (Phase 1 items 3–6).

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

## 2.3 Strategic realignment (2026-06-28) — the 60-second dopamine loop

> This section supersedes the *sequencing and emphasis* of the phases below where they
> conflict. The phases (4–8) remain accurate as a catalogue of work and as the PAID
> ladder; what changed is **what to build next and why**. Nothing built is wasted —
> the issue was sequencing, not quality.

**The core problem.** Argos has a cold-start + retention problem disguised as a feature
problem. The winning platforms (chess.com blitz, Omegle) nailed one thing first: an
**instant, repeatable, low-friction core loop**. Everything else (ratings, profiles,
tournaments) came *after* the loop was addictive. Argos's current loop is multi-hour and
high-effort: pick a topic → wait for a human → write a paragraph → wait → wait for AI
scoring → repeat over 3 rounds. The roadmap below was "the roadmap of a successful app,
built before the app is successful." This realignment fixes time-to-first-dopamine.

**Confirmed decisions (owner, 2026-06-28):**

1. **De-emphasize, do NOT delete, the low-value built features.** Daily-topic leaderboard
   (`/daily`), audience voting, argument reactions, debate replay, and anti-Sybil IP
   fingerprinting are all merged, cost nothing at idle, and mostly only "activate" with
   traffic. Keep the code; stop investing; reduce UI prominence (demote `/daily` from the
   nav). Deleting them is pure regression risk for zero upside.
2. **vs Oracle: keep AND reuse.** Keep the Oracle as a customizable opponent in the
   "new debate" flow (as today), *and* reuse the same Oracle engine as the backend for a
   new **instant 1-round Lightning solo mode**. Reframing matters: the judge scores
   **argumentation quality only — never who is factually correct** (see §1 / `PROJECT.md`
   §7), so "the AI knows more so it always wins" is false — a sharp human beats the Oracle
   on clarity/evidence/logic/rebuttal/fallacy-avoidance. The Oracle can also be tuned
   beatable (novice/adept/master) so new users get early wins (dopamine).
3. **Persistent / "trending" open challenges.** Evolve `challenges` from single-shot
   (`open` → `accepted` → dead) into a creator-owned, **reusable** artifact: a posted
   challenge shows on the homepage like an X/Twitter "trending" panel; when someone joins
   it locks (others spectate only); after the debate concludes it **reopens**; the creator
   gets an **in-app notification** on each join; it persists until the creator deletes it.
   This fixes the "new debate has no dopamine (create → wait on a private link)" gap by
   turning every created debate into a public, joinable, reusable surface.
4. **Random matching is always ranked** (normal + blitz), as designed. The **Lightning /
   solo-Oracle on-ramp is casual** so a brand-new user's first taste is low-stakes and
   they don't get demoralized losing their first *ranked* human match.
5. **Free web push / PWA is a NOW / FREE item** (moved out of PAID). The web-push standard
   is free; only *managed* services (OneSignal, etc.) cost money. This is the
   highest-leverage missing retention primitive for async turn-based play on mobile.

**Deferred to far-future prospects (explicitly NOT now):** education / institutional
licensing (a different, B2B company — splits focus pre-PMF) and tournaments with entry
fees (payments + gambling-adjacent regulation, needs a crowd). They remain in Phase 5 as
long-term revenue density, not near-term work.

### 2.4 NEXT-UP execution order (this realignment — all FREE)

Do these in order; each is free-tier and reuses existing infrastructure:

1. **1-round Lightning + instant solo-vs-Oracle on-ramp (casual).** ✅ DONE (shipped). A
   `lightning: true` debate is a single round (`total_rounds: 1`), blitz-paced, casual, vs
   the Oracle, with ZERO wait: the human submits one argument, the Oracle replies
   immediately, both are scored by the existing judge, and the debate finalizes to a
   result. **NO migration** — `submit_argument` (0003) already finalizes `total_rounds=1`
   (round-count >= 2 after human + Oracle => last-arg AND last-round => `scoring`); the
   existing oracle-turn trigger, async scoring, and finalize path all handle it. It reuses
   the vs-Oracle create path verbatim (forcing oracle + 1 round + blitz + casual behind the
   flag) and counts against the same `oracle_debates_today` cap. Surfaced as a prominent
   “⚡ Lightning” dashboard card; the roast result page cross-links into it. *The first
   experience is instant and solo.*
2. **Persistent open challenges + in-app join notifications.** ✅ DONE (shipped). `challenges`
   is now a creator-owned, reusable artifact: a challenge can be marked **reusable** so it
   reopens automatically after its debate concludes (locks on join — others spectate — then
   a DB trigger flips it back to `open`), and the creator gets an **in-app notification**
   each time someone joins. Migration **0018** is additive + idempotent
   (`challenges.reusable/rounds/blitz`, a `notifications` table with own-row RLS, and the
   `reopen_reusable_challenge` trigger on `debates`). The accept route honours the
   challenge's stored rounds/blitz format and notifies the creator (fail-open, service-role).
   A Navbar bell (Realtime, fail-open) shows unread notifications; the post form gained
   Reusable + Rounds + Speed options, and cards show the format before joining. Fully
   runnable BEFORE or AFTER 0018 (every new column/read is fail-open). *Cost: 0.*
   *(Follow-up ✅ DONE: a dashboard Open-Challenges discovery panel — `fetchOpenChallenges`
   + `OpenChallengesPanel` — surfaces a few recent open challenges with their format pills
   so a cold user has a one-tap entry instead of a blank topic box (§2.5 force 5). No
   migration; renders nothing when empty.)*
3. **Free web push / PWA.** Service worker + web-push (VAPID) for async turn + "someone
   joined your challenge" + "your turn" nudges. Mobile-first, free, no managed service.
4. **Daily single-player "spot the fallacy" 30s mini-game.** Reuses the judge; daily-active
   + viral + shareable; no opponent needed.
5. **Sharpen the share scorecard** (`/api/og` + recap card) — the only built-in growth loop.

> Then, and only then, return to the depth/retention items already catalogued below. The
> fastest path to "popular + revenue" is to stop adding depth and start compressing the
> time-to-first-dopamine.

---

## 2.5 Psychology & positioning (2026-06-28) — build a mirror, not just a game

> This layer sits ON TOP of §2.4. §2.4 says *what* to build next; this says *how to make
> it habit-forming and shareable, and what the product is really for.* Where §2.4 items
> and this layer overlap, ship them together — a fast loop with no identity payoff is just
> a quiz; a fast loop that tells you who you are is a habit.

### The repositioning (the most important idea in this doc)

Argos is **not** "chess.com for debate" — that is the *mechanic*. Argos is **a mirror for
how people think.** The AI judge that names your fallacies is a *self-knowledge machine*,
which is psychologically rarer and stickier than a debate game. People don't get addicted
to chess.com because games are fast; they get addicted because *being rated makes them
someone.* Steer the entire product toward **"this app tells me how my mind actually
works"** — something you cannot get from ChatGPT, Reddit, or Omegle. The debate is the
depth; self-knowledge is the hook.

### Five behavioral forces to engineer (priority order)

1. **Variable-ratio reward on the verdict (the core dopamine engine).** Dopamine spikes on
   *reward-prediction-error* — the unexpected, not the reward itself (Schultz). The score
   reveal is a slot machine that isn't tuned yet. Engineer the sequence: submit → a 2–3s
   "Oracle deliberating" beat → dimensions count up one at a time → fallacy call-outs land
   LAST with a sting. Make the gap between submit and verdict a held breath. Zero new
   backend; pure reveal UX. (Why chess.com / Duolingo / Hinge over-invest in resolution
   animation.)
2. **Loss aversion via streaks + a rank you can lose.** Losses hurt ~2× as much as
   equivalent gains feel good (Kahneman); Duolingo's empire is streak-loss panic. Tie Elo
   (a number that can fall) and the daily mini-game (a streak surface) to identity: a
   **daily streak** on the fallacy mini-game (from v1, not later), a **"protect your rank"**
   nudge after ~2 idle days, and a weekly **"your mind this week"** recap (fallacies you
   commit most, strongest dimension). The recap is also the best ORGANIC share artifact —
   it's *about them*, far better than a single scorecard.
3. **Identity & labeling (the retention multiplier most debate apps miss).** After ~5
   debates, the Oracle assigns a **mind archetype** derived from the user's real score
   pattern — "The Logician" (high logic, low rebuttal), "The Closer" (high rebuttal), "The
   Rhetorician" (high clarity, weak evidence), etc. Forer/Barnum effect + self-perception
   theory: once labeled, people *act to confirm the label* and *broadcast it* (why MBTI,
   Spotify Wrapped, and "which character are you" quizzes go viral). It's a pure function
   over data you already store, and it converts a score into a defended, shared identity.
4. **Social proof + the spectator→player ladder.** Watching is the low-commitment
   foot-in-the-door (Cialdini commitment/consistency); you built spectating but there's no
   conversion step. After a logged-out viewer watches ONE debate, drop an instant pre-auth
   nudge: *"You'd have scored this argument how? Try one round vs the Oracle — no signup."*
   Let the first taste happen BEFORE the auth wall — the gate is where most consumer funnels
   die.
5. **Kill the blank-page tax at the entry screen.** Asking a cold user to invent a topic is
   the biggest conversion killer (choice paralysis / Hick's Law). The homepage must never
   show an empty topic box first — it shows **one tap: "Debate this →"** on a hot,
   pre-loaded topic. Make the trending-challenges panel (§2.4 item 2), not topic-creation,
   the default front door.

### Two product bets to add (not previously in the roadmap)

- **Solo "roast my take" (async, no opponent, no rounds) — likely the single biggest growth
  lever.** ✅ DONE (shipped). Paste any hot take (a tweet, a Reddit comment); the Oracle
  scores it and names the fallacies instantly. `/roast` + `POST /api/roast` reuse the
  existing neutral judge (`scoreArgument`) VERBATIM and write NOTHING to the DB (no debate,
  no argument, no topic row, no Elo) — so it cannot affect any existing flow and needs no
  migration. Auth-gated, fail-open rate-limited (10/60s via `check_rate_limit`, 0008), and
  passes the same cheap regex gate + Gemini safety pass used on real arguments. The UI
  implements the §2.5 force-1 tuned verdict reveal (deliberation beat → dimensions count up
  → fallacies land last) and the §2.5 force-3 mind-archetype payload, then an X share intent.
  Surfaced via a `ROAST` nav link + a landing-page secondary CTA. *The debate is the depth;
  the solo roast is the hook.*
- **Ship §2.4 item 1 WITH the tuned verdict reveal (force 1) and the mind-archetype label
  (force 3) from day one** — not as later polish. The label and the reveal ARE the
  retention; the fast loop without them is just a quiz.

### Monetization reframing (carry into Phase 5)

Do NOT anchor on a $6 "play more" sub. People pay for **insight about themselves** and
**getting better** far more reliably than for unlimited matches. Reframe Argos Pro as
**"Argos Coach"**: personalized fallacy-pattern analysis, "your weakest dimension + 3 drills
to fix it," annotated replay improvement tips, and unlimited solo roast. Price **$8–12/mo**.
This is a Calm / Duolingo-Plus framing (pay to improve yourself), which converts ~3–5×
better than pay-to-play-more. Education / tournaments stay deferred (§2.3); the scoring
engine as a metered API is a real Year-2 B2B option once the judge is proven by the
consumer loop.

### One-line strategy

Argos is **a mirror for how people think**; the debate is just the most engaging way to
look into it. Make **solo roast + mind-archetype + streak** the front door, engineer the
five forces above, and position the whole product around self-knowledge — not a game
competing for the attention of people who already argue for free on X.

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
1. **Apply the DB indexes.** ✅ Applied (`supabase/migrations/0005_indexes.sql`):
   `idx_debates_player_a`, `idx_debates_player_b`, `idx_debates_status`,
   `idx_arguments_debate`, `idx_users_elo`. *Cost: 0.*
2. **vs Oracle AI mode (cold-start killer).** ✅ DONE. A user can debate Gemini
   when no human opponent is available; Gemini plays the opposing side and the
   same neutral judge scores both.
   - `opponentType: "ai"` on `POST /api/debates` creates an ACTIVE debate with
     the seeded Oracle system user (`00000000-0000-0000-0000-0000000000a1`,
     migration `0006`) as `player_b`. vs-AI debates are casual (no Elo).
   - The argue layer is isolated in `lib/ai/oracle.ts` (`argueAsOracle`), mirroring
     the judge isolation rule. The Oracle moves via `/api/debates/[id]/oracle-turn`
     (trusted internal call) and submits through the same `submit_argument` SQL
     function humans use; the maintenance cron is the free backstop.
   - Gated to **3 vs-Oracle debates/user/day** via `oracle_debates_today()`
     (migration `0006`) to protect the Gemini free tier.
3. **Stronger moderation, still free.** ✅ DONE. `moderateWithOracle()` in `lib/ai/judge.ts`
   runs a Gemini safety-classification pass (hate / harassment / sexual-minors / doxxing /
   spam) on every human argument AFTER the cheap regex/length gate and BEFORE any write
   (`app/api/debates/[id]/argument/route.ts`). FAIL-OPEN: a Gemini error never blocks a
   legitimate user; the regex/length filter stays the always-on gate. *Cost: marginal Gemini.*
4. **Report / block / mute (DB + UI).** ✅ DONE (tables from migration `0007`). `/api/reports`
   + a Report button on opponents' arguments; `/api/blocks` (GET/POST/DELETE) + a Block button
   on profiles. Matchmaking already excludes mutually-blocked users (`match_player`, `0007`).
   *Remaining:* hiding blocked users from the public **feed** is deferred — it needs the
   `public_debate_feed` view to expose player ids; tracked as a follow-up. *Cost: 0.*
5. **Basic anti-Sybil.** ✅ DONE. `lib/safety/fingerprint.ts` stores a one-way hashed IP on
   the user row (`backfillIpHash`, first-sight only) and flags debates where both players
   share that hash via `flag_sybil_debate()` (migration `0008`) on matchmaking + challenge
   accept. SOFT SIGNAL ONLY — sets `debates.suspected_sybil` for review, never auto-bans.
   Ranked matchmaking is also rate-limited (item 6). *Cost: 0.*
6. **Rate limit scoring & matchmaking endpoints.** ✅ DONE. `lib/rateLimit.ts` wraps the
   `check_rate_limit()` SQL function (migration `0008`). `/api/matchmaking` POST+GET capped
   at 30/60s/user; `/api/score` capped at 60/60s/user for direct (browser self-heal) callers
   — trusted internal calls (argument route, oracle-turn, maintenance) are exempt. Fail-open
   on DB error so a throttle fault never locks users out. *Cost: 0.*
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
1. **Decouple scoring from the request path.** ✅ DONE (option A — Postgres queue).
   `app/api/debates/[id]/argument/route.ts` no longer awaits `/api/score`: it inserts the
   argument as `pending`, enqueues a durable `scoring_jobs` row (`migration 0009`), fires the
   score call **fire-and-forget**, and returns immediately. The maintenance cron drains the
   queue via `claim_scoring_jobs()` (`FOR UPDATE SKIP LOCKED`, re-claims stale jobs); the
   score route deletes the job on a terminal state. The old stuck-argument scan + client
   self-heal remain as secondary safety nets. The vs-Oracle path uses the same async flow.
   *Cost: 0.*
   - **⚠️ Run `supabase/migrations/0009_scoring_jobs.sql` in Supabase** (idempotent, safe to re-run).
2. **Add Supabase connection pooling.** ✅ N/A at runtime + documented. Argos's runtime
   queries all go through `@supabase/supabase-js` / `@supabase/ssr` over **PostgREST**, which
   is already pooled server-side by Supabase — there is no app-side connection pool to
   exhaust. The only direct-Postgres consumer is **drizzle-kit at migration time**; point its
   `SUPABASE_DB_URL` at the **Supavisor pooled** connection string (port 6543) in Supabase
   → Settings → Database. No code change needed. *Cost: 0.*
3. **Cache the hot read paths.** ✅ DONE (leaderboard). The leaderboard first page (where
   ~all traffic lands) is served from `unstable_cache` (60s revalidate, tag `leaderboard`),
   invalidated immediately when a ranked Elo settles (`finalizeIfComplete`). Both the
   leaderboard and public feed were already paginated in SQL. *Remaining:* the public feed
   already uses `force-dynamic`; a cached first-page variant is a cheap follow-up. *Cost: 0.*
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
1. **Live spectator mode.** ✅ DONE. Any logged-in non-participant watches `/debate/[id]`
   read-only — input/resign controls are gated by `isMyTurn` (always false for a spectator)
   and the server re-checks participation, so it is read-only on both sides. A “Spectating”
   banner clarifies the You/Opp. columns, and `SpectatorPresence` shows a live “N watching”
   count via a Supabase Realtime **presence** channel; argument/score updates arrive via the
   existing `debates`/`arguments` broadcast. *Cost: 0 within free Realtime limits.*
   *(Follow-up: a “Live now” discovery surface + optional anonymous/logged-out spectating.)*
2. **Audience voting alongside the AI.** ✅ DONE (`migration 0011` → `spectator_votes`).
   Spectators vote per round for Player A / Player B; the `AudienceVote` widget shows a live
   “Crowd 73% / 27%” split + vote count next to the Oracle's verdict. `/api/votes` enforces
   one vote per (debate, user, round), toggle/switch, and blocks participants from voting.
   **⚠️ Run `supabase/migrations/0011_spectator_votes.sql`** (idempotent). *Cost: 0.*
   <!-- legacy line retained below for context -->
   _Originally:_ Spectators vote per round; show "Crowd 73% /
   Oracle P1". Store in a `spectator_votes` table. Huge engagement multiplier. *Cost: 0.*
3. **Blitz mode.** ✅ DONE. A `blitz` flag on debates (`migration 0010`) runs **90s turns**
   instead of 10 min. The new-debate page has a Speed selector (Standard / ⚡ Blitz); the
   DebateRoom timer + the auto-forfeit window both honour it (90s + 30s grace = 120s). Pairs
   perfectly with presence matchmaking (Phase 4). *Cost: 0.*
   - **⚠️ Run `supabase/migrations/0010_blitz_mode.sql`** (idempotent, safe to re-run).
   - *Caveat:* the free GitHub Actions maintenance cron runs ~every 5 min, so a Blitz
     timeout is only auto-forfeited at that cadence. Live play is unaffected (the client
     timer + normal submit flow drive the debate); only an abandoned blitz turn waits for
     the next cron tick. A faster trigger comes with Vercel Pro cron (Phase 2 PAID).
4. **Better viral share artifact.** You already generate an OG image (`/api/og`). Add a
   "debate recap" share card that highlights the score reveal + the best fallacy call-out.
   (Animated video clips are a PAID/later item — static first.) *Cost: 0.*
   *(§2.4 NEXT-UP item 5 — pull forward; the only built-in growth loop.)*
4b. **Daily single-player "spot the fallacy" mini-game.** 30-second, single-player,
   shareable, no opponent — reuses the existing judge. Daily-active + viral + spectator→
   player funnel fuel. *Cost: 0.* *(§2.4 NEXT-UP item 4.)*
4c. **Free web push / PWA.** Service worker + the free web-push (VAPID) standard for async
   turn nudges, "someone joined your challenge," and "your turn." Mobile-first retention; no
   managed service. *Cost: 0.* *(§2.4 NEXT-UP item 3 — moved here from PAID.)*
5. **Daily Topic global leaderboard.** ✅ DONE. `/daily` ranks everyone who completed a
   debate on today's Daily Topic by total argument score (with debates + wins), cached
   (`lib/cache/dailyLeaderboard.ts`, 120s, tag `daily-leaderboard`, invalidated on any
   debate completion). Linked from the Daily Topic banner. No migration. *Cost: 0.*
6. **Achievements / titles / badges** (`#9` in `PROJECT.md`) — Elo milestones + fallacy-free
   streaks on the profile. Cheap retention + share fuel. *Cost: 0.*
7. **Debate replay** (`#10`) — `/debate/[id]/replay` timeline view that scroll-animates the
   scores. Reuses existing data. *Cost: 0.*

### 💰 PAID (when budget exists)
- **Auto-generated highlight video/clips** for TikTok/Reels/X (e.g. Remotion render on a
  worker, or an API like Shotstack). The single best top-of-funnel artifact, but needs
  compute. *Realistic spend: render minutes, ~$10–30/mo at small scale.*
- ~~**Web push notifications**~~ — **moved to FREE** (§2.4 item 3 / Phase 3 FREE item 4c):
  the web-push (VAPID) standard is free. Only reach for a managed service (OneSignal, etc.)
  if/when volume forces it; it has a free tier anyway.

---

## 7. PHASE 4 — Real-time multiplayer at scale (Omegle / chess.com parity)
> Goal: instant pairing of online strangers, many concurrent live matches.

### 🟢 FREE
1. **Presence-based matchmaking.** Use **Supabase Realtime presence channels** to track who
   is *online right now*. Pair two live users instantly instead of queue+poll. Combine with
   Blitz mode (Phase 3) for the Omegle experience. *Cost: 0 within free Realtime concurrency.*
   **Always ranked** (normal + blitz), per the §2.3 realignment.
2. **Lobby with live online count + "Quick Match" button.** Show how many are online and
   waiting; one click drops you into a blitz debate. *Cost: 0.*
3. **1-round Lightning + instant solo-vs-Oracle on-ramp (casual).** §2.4 NEXT-UP item 1 —
   *the highest-priority FREE work in this realignment.* One argument each, AI-scored, done
   in ~90s; the solo variant has zero wait. Casual (low-stakes first taste) so it doesn't
   collide with always-ranked random matching. Reuses the existing judge + Oracle. *Cost: 0.*
4. **Persistent "trending" open challenges + in-app join notifications.** §2.4 NEXT-UP item
   2 — evolve `challenges` into a creator-owned, reusable artifact surfaced on the homepage
   (X-style trending panel); locks on join (others spectate), reopens after the debate
   concludes, notifies the creator in-app on each join, persists until deleted. Additive
   schema (`reusable` flag + a lightweight `notifications` table). *Cost: 0.*
5. **Load test before launch.** Use a free tool (k6 OSS, Artillery free) to find the
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
1. ✅ Apply DB indexes (Phase 1) — done (`0005`).
2. ✅ Ship **vs Oracle AI mode** (Phase 1) — done. Kills cold-start.
3. ✅ Upgrade moderation to a Gemini safety pass + wire report/block on top of the
   `reports`/`user_blocks` tables created by `0007` (Phase 1) — done.
4. ✅ Rate-limit `/api/score` + `/api/matchmaking` via `check_rate_limit()` (`0008`) + anti-Sybil flagging (`0008`) — done.
5. ✅ Decouple scoring from the request path — Postgres `scoring_jobs` queue drained by the maintenance cron (Phase 2 item 1). Done.
6. ✅ Connection pooling (N/A at runtime; documented for drizzle-kit) + leaderboard read-path caching (Phase 2 items 2-3).
7. ✅ Live spectator mode (Phase 3 item 1) — done.
8. ✅ Blitz mode (Phase 3 item 3) — done.
9. ✅ Audience voting (Phase 3 item 2) — done.
10. ✅ Per-topic Daily Topic leaderboard (Phase 3 item 5) — done.
11. ✅ Live realtime feed fix (sequential debates show the opponent's move
    instantly) + "Opponent is typing…" indicator + shared Elo settlement
    (`lib/debates/settle.ts`).
12. ✅ Achievements / titles / badges — on-the-fly, no schema (`lib/achievements.ts`,
    `components/profile/Achievements.tsx`, wired into the profile page).
13. ✅ Debate replay — `/debate/[id]/replay` stepped timeline with running score
    tally (`components/debate/DebateReplay.tsx`), reuses existing data, no schema.
14. ✅ Phase 4 Quick Match — dashboard Quick Match card pairs into a Blitz debate
    via the existing race-safe queue (`match_player_v2`, migration 0014, idempotent),
    plus a live `OnlinePresence` "N online" pill. Falls back to `match_player` if
    0014 isn't applied yet, so the app stays runnable.
15. ✅ **“Live now” discovery surface.** `/live` lists active + public debates
    (existing tables only, no migration) with a pulsing `LIVE` nav link, so
    spectators can find a match in progress and jump into the read-only room.
16. ✅ **Phase 5 plumbing — usage metering + `is_pro` flag.** `migration 0015`
    adds `users.is_pro` + a `daily_usage` counter (`record_usage`/`usage_today`).
    `lib/billing/limits.ts` is the single source of truth (free vs Pro daily
    limits + `getEntitlements`); `BETA_UNLIMITED=true` keeps everyone unlimited
    so the paywall is a later one-line flip. `lib/billing/usage.ts` is fail-open
    (no-op pre-0015) and is wired into `POST /api/debates`. No user-facing change.
17. ✅ **Hide blocked users from the public feed.** `migration 0016` exposes
    `player_a_id`/`player_b_id` on `public_debate_feed`; `/debates` filters out
    debates involving anyone the viewer blocked or who blocked them (SQL-side,
    pagination-accurate). Fail-open + runnable pre-0016.
18. **NEXT (FREE):** remaining Phase 3 follow-ups — anonymous/logged-out
    spectating + a cached public-feed first page. Then Phase 5: gate a Pro-only
    nicety behind `is_pro` (still beta-open) to exercise the plumbing. All
    FREE-tier; 💰 PAID deferred.

> **Phase 3 (virality) progressing:** spectator mode ✅, Blitz mode ✅, audience voting ✅,
> daily-topic leaderboard ✅; next are achievements/badges + replay.
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
