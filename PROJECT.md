# PROJECT: Argos — AI Debate Arena (build history & reference)

> **What this file is.** The build-history + architecture/schema **reference** for Argos.
> For *where the project goes next and why*, read **`ROADMAP.md` first** — it is the single
> source of truth for strategy, the build ledger (BUILT / IN PROGRESS / NEXT / LATER), and
> FREE-vs-PAID sequencing. This file records *how things were built* and the schema.
>
> **Reading order for a new agent:** `ROADMAP.md` → this file → `README.md` → `PUSH_SETUP.md`.
>
> **Ground truth:** everything described here is **merged to `main` and deployed**, and all
> migrations **`0002`–`0019` are APPLIED**. Any "awaiting merge / run this migration"
> wording below is historical — ignore it. Budget: **free tiers only** (the only paid
> dependency is the owner's Gemini subscription); see `ROADMAP.md` §7 for the PAID ladder.
>
> Only the section `## 15. Current Status

**Session:** Mind archetype on the profile (ROADMAP §2.5 force 3) (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Mind archetype on the profile (ROADMAP §2.5 force 3 — identity & labeling,
  the retention multiplier).** A user's profile now shows the "mind archetype"
  the Oracle reads from their REAL score pattern (The Logician / The Closer /
  The Rhetorician / The Empiricist / The Provocateur), with a strength + a
  "grow" (weakness) dimension. **Pure computation over data already stored — NO
  migration, NO schema, NO Gemini.**
  - `lib/ai/archetype.ts` gains `aggregateArchetype(rows, minSample=5)` — a PURE
    helper that averages a user's per-argument dimension scores into one
    `ArchetypeInput` and runs the existing `getArchetype` mapping, returning
    null below the sample threshold so the label only appears once earned.
  - `app/profile/[username]/page.tsx` extends its existing bounded scored-
    arguments read to also select the dimension scores + `fallacy_penalty`,
    computes the archetype, and renders it between the stat grid and the rating
    trajectory. Reveal animations re-staggered (1–6).
  - `components/profile/MindArchetype.tsx` — server-rendered identity card
    (Oracle Terminal: gold glass, `text-shimmer` title, strength/grow pills);
    below ~5 scored arguments it shows an "archetype not yet revealed" teaser
    (own-profile copy nudges "keep debating").
  - **Runnable as-is.** Reuses the archetype engine already powering `/roast`.

#### Prior checkpoint
**Session:** Sharper share scorecard — OG verdict card + fallacy call-out (ROADMAP §2.4 item 5) (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Sharpened the shareable scorecard (ROADMAP §2.4 item 5 — the only built-in
  growth loop).** Redesigned `app/api/og/route.tsx` from the generic green/black
  sans-serif card into a branded **Oracle Terminal** verdict card (void bg, gold
  accents, gold rule, serif), with “◆ THE ORACLE’S VERDICT” framing, per-player
  scores tagged FOR/AGAINST, and a clear winner line.
  - **NEW “sharpest fallacy” call-out:** the OG card now surfaces the single
    highest-penalty fallacy detected across the debate (name + the offending
    quote) — the spicy, shareable sting the roadmap asks for. The OG query now
    also selects `fallacy_penalty, fallacies_found`.
  - **Still public-safe:** a private or missing debate renders the generic brand
    card (no topic/score leak). Still 1200×630, flexbox-only (the `ImageResponse`
    constraint — no grid).
  - **Sharper share text:** the result-card X intent in
    `components/debate/DebateRoom.tsx` now leads with the verdict + the
    self-knowledge hook (§2.5) instead of a flat “Score: X-Y”, and is
    outcome-aware (win/draw/loss). It attaches the same debate URL, so the
    upgraded OG card renders as the preview.
  - **NO migration, NO schema, NO env change.** Runnable as-is.

#### Prior checkpoint
**Session:** Daily “spot the fallacy” mini-game (ROADMAP §2.4 item 4) (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Daily “spot the fallacy” 30s mini-game (ROADMAP §2.4 item 4 / §2.5 force 2).**
  A single-player, daily, shareable puzzle with a streak — daily-active +
  loss-aversion retention. **NO Gemini, NO DB, NO migration, NO env.**
  - `lib/fallacyGame.ts` — a curated round bank using the judge’s EXACT
    10-fallacy taxonomy (§7). A deterministic UTC-date seed picks today’s round
    (`getDailyFallacyRound`), so everyone gets the same puzzle today and it
    resets at 00:00 UTC. Pure, no I/O.
  - `app/fallacy/page.tsx` (server, auth-gated) + `app/fallacy/loading.tsx`
    (`OracleLoader`).
  - `components/fallacy/FallacyGame.tsx` (client island): 30s timer (timeout =
    miss), 4 options, reveal with the explanation, and a **localStorage daily
    streak** (fail-safe, no backend; advances once per UTC day, resets on a
    miss) + an X share intent. Oracle Terminal aesthetic + §2.5 force-1 reveal
    pacing.
  - Surfaced via a `FALLACY` Navbar link (after ROAST) and a “Spot the Fallacy”
    dashboard action card.
  - **Runnable as-is.** A future DB-backed streak/leaderboard is an optional
    later enhancement; v1 is intentionally client-only + free.

#### Prior checkpoint
**Session:** “Your turn” web-push nudges (ROADMAP §2.4 item 3 follow-up) (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **“Your turn” web push.** Extends the push layer so a player is nudged when
  it becomes their move — the core async-retention reason push exists. NEW
  `lib/push/turn.ts` `notifyTurn(debateId)`: a FAIL-OPEN helper that pushes the
  player whose turn it now is, but ONLY when the debate is still `active` and
  `current_turn` is a real HUMAN (never the Oracle system user, never null). It
  resolves its own service client + debate state, so callers pass only the
  debate id; `sendPush` itself no-ops when push isn’t configured, so the whole
  chain is harmless before VAPID/web-push setup. Wired into:
  - `app/api/debates/[id]/argument/route.ts` — after a human submits and the
    turn flips to a HUMAN opponent (the existing `postState` check is reused;
    skipped for the Oracle’s turn and for the final round that goes to
    `scoring`, and never pushes the submitter).
  - `app/api/debates/[id]/oracle-turn/route.ts` — after the Oracle replies and
    the turn flips back to the human in a multi-round vs-Oracle debate
    (no-ops on the last round, which finalizes).
  Fire-and-forget throughout. NO migration, NO schema change. Runnable as-is.

#### Prior checkpoint
**Session:** Free web push / PWA (ROADMAP §2.4 item 3) (FREE) + Lightning topic-dedup bugfix
**Date:** 2026-06-28

### This checkpoint
- 🐛 **Fixed: Lightning (and any repeated topic title) failed with
  `duplicate key value violates unique constraint "topics_title_unique"`.**
  Migration 0004 added `UNIQUE(topics.title)` and made the SQL `match_player`
  reuse topics via `insert ... on conflict (title) do nothing`, but the
  app-layer routes still did a blind `insert` into `topics`. Lightning hit this
  every time after the first run because it seeds the topic from the Daily
  Topic. New `lib/topics.ts` `getOrCreateTopic()` mirrors the 0004 pattern
  (upsert-ignore-on-conflict, then select) and returns `{ id, created }`;
  `app/api/debates/route.ts` + `app/api/challenges/route.ts` now use it. The
  orphaned-topic cleanup on a failed debate insert only deletes a topic we
  actually just created (`created === true`), so it can never delete a shared/
  reused topic row. NO migration, NO schema change.

- ✅ **Free web push + installable PWA (ROADMAP §2.4 item 3).** Mobile-first
  re-engagement using the free web-push (VAPID) standard — NO managed service.
  **FAIL-OPEN on every axis: the app is fully runnable BEFORE or AFTER
  migration 0019, and BEFORE or AFTER `npm install web-push` / setting the
  VAPID env vars.**
  - **⚠️ Run `supabase/migrations/0019_push_subscriptions.sql`** — ADDITIVE +
    **IDEMPOTENT (safe to run twice)**. Adds a `push_subscriptions` table
    (own-row RLS: users read/delete only their own; server-role inserts).
  - `lib/push/send.ts` `sendPush(recipientId, {title, body, url})` —
    **dynamically imports** `web-push` so a missing package can't break the
    build; no-ops without the package, without VAPID env, or without 0019.
    Prunes dead (404/410) subscriptions. Returns count delivered.
  - `lib/push/subscriptions.ts` — fail-open `saveSubscription` (upsert by
    endpoint) / `deleteSubscription` helpers.
  - `app/api/push/subscribe` + `app/api/push/unsubscribe` route handlers
    (service-role writes; auth-gated; fail-open).
  - `app/manifest.ts` — web app manifest (Oracle Terminal palette: void bg,
    gold theme) for home-screen install (a push precondition on iOS 16.4+).
  - `public/sw.js` — minimal service worker: `push` shows the notification,
    `notificationclick` focuses an existing tab or opens the target URL. No
    offline precaching (avoids stale shells).
  - `components/push/PushManager.tsx` — client island in the Navbar
    (logged-in only). **Renders NOTHING** unless the browser supports
    SW+Push AND `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set, so it's invisible
    until push is configured. Registers `/sw.js`, toggles subscribe/
    unsubscribe, shows an iOS “Add to Home Screen first” hint. Bell-icon,
    Oracle aesthetic, all errors soft-handled.
  - **Wired in:** the challenge-accept route now best-effort `sendPush`es the
    creator alongside the in-app bell (fire-and-forget, never blocks the join).
  - `next.config.ts` adds `sw.js` no-cache + correct content-type headers.
  - `package.json` adds `web-push` + `@types/web-push` (install locally/on
    deploy; the dynamic import keeps the build green until you do).
  - **Setup (all free, optional — app runs without it):**
    1. `npm install` (picks up `web-push`).
    2. `npx web-push generate-vapid-keys` → set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
       `VAPID_PRIVATE_KEY` (and optionally `VAPID_CONTACT_EMAIL`) in Vercel.
    3. Run migration 0019 in Supabase.
    4. Add `public/icon-192.png` + `public/icon-512.png` (any square logo) so
       the install icon + notification icon render. The app is fully runnable
       without these; only the icons are missing until added.
  - **NEXT checkpoint:** wire `sendPush` into the “your turn” path
    (submit-argument / maintenance cron) for async-turn nudges.

#### Prior checkpoint
**Session:** Open-Challenges dashboard discovery panel (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Dashboard Open-Challenges discovery panel (ROADMAP §2.4 item 2 follow-up / §2.5
  force 5: kill the blank-page tax).** A cold user now sees a few recent OPEN challenges
  (topic + format + creator) as a one-tap entry on the dashboard instead of a blank topic
  box. **NO migration, NO schema change, fail-open.**
  - `lib/challenges.ts` `fetchOpenChallenges()` — reusable server reader; selects the
    persistent-challenge columns with a minimal-set fallback (pre-0018 safe), excludes the
    viewer's own challenges (can't accept your own), resolves creator names/Elo in one
    batched query, capped small. Returns `[]` on any error.
  - `components/OpenChallengesPanel.tsx` — server-rendered card list matching the Daily
    Topic / action-card aesthetic (glass cards, format pills: rounds / ⚡ Blitz / ♾
    Reusable). Each links to `/challenges` (existing accept flow). Renders NOTHING when
    there are no open challenges, so it never leaves dead space.
  - `app/dashboard/page.tsx` fetches it in the existing `Promise.all`; `DashboardClient`
    renders it between the Daily Topic and the Certamen action grid (matching hover CSS).
  - **Runnable as-is.**

#### Prior checkpoint
**Session:** Persistent challenges + in-app notifications (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Persistent (reusable) challenges + in-app join notifications (ROADMAP §2.4 item 2).**
  `challenges` evolves from single-shot (open → accepted → dead) into a creator-owned,
  reusable artifact, plus a lightweight in-app notification system.
  - **⚠️ Run `supabase/migrations/0018_persistent_challenges_notifications.sql`** — ADDITIVE
    + **IDEMPOTENT (safe to run twice)**. Adds `challenges.reusable/rounds/blitz`, a
    `notifications` table (own-row RLS), and `reopen_reusable_challenge()` — an
    `after update of status on debates` trigger that flips a reusable challenge back to
    `open` (clearing `debate_id`) when its debate completes. The app is fully runnable
    BEFORE or AFTER applying it.
  - **Reusable lifecycle:** a reusable challenge is claimed (`accepted` + `debate_id`) on
    join so others can only spectate, then the trigger reopens it the moment the debate
    completes. Non-reusable challenges keep today's behaviour (stay `accepted`).
  - **Notifications:** `lib/notifications.ts` `createNotification()` is FAIL-OPEN (no-op if
    the table is absent). The accept route inserts a `challenge_join` notification to the
    creator (service-role, never blocks the join). `components/NotificationBell.tsx` (wired
    into `Navbar`, logged-in only) loads + Realtime-subscribes + marks-read, and resolves
    its own user id via `auth.getUser()` so NO `<Navbar />` call site changed.
  - **Create options:** the post form (`ChallengeLobby`) gained Reusable + Rounds + Speed;
    the accept route builds the debate with the challenge's stored rounds/blitz; cards show
    the format pills before joining. `/api/challenges` create + `app/challenges/page.tsx`
    read both fall back to the minimal column set pre-0018.
  - **Runnable as-is** before or after 0018 (all new reads/writes fail-open).

#### Prior checkpoint
**Session:** Lightning on-ramp — 1-round instant solo-vs-Oracle (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **⚡ Lightning — the sub-60s on-ramp (ROADMAP §2.4 item 1).** One tap starts a single
  round (`total_rounds: 1`), blitz-paced, casual debate vs the Oracle with ZERO wait. The
  human submits one argument, the Oracle replies immediately, both are scored by the
  existing judge, and the debate finalizes to a normal result/scorecard.
  - **NO migration, NO schema change.** `submit_argument` (0003) already finalizes a
    1-round debate correctly: `v_is_last_arg := round_count >= 2`, so after the human (1) +
    Oracle (2) the single round is both last-arg and last-round and `status` flips to
    `scoring`. The existing oracle-turn trigger, async scoring queue, and finalize path all
    already handle `total_rounds=1` — verified against the SQL.
  - `app/api/debates/route.ts` accepts `lightning: true` and forces the shape (oracle +
    1 round + blitz + casual), reusing the rest of the vs-Oracle create path verbatim
    (ACTIVE start, `oracle_debates_today` cap, oracle-turn trigger). `1` is intentionally
    NOT in `ALLOWED_ROUNDS`, so a single-round debate can ONLY be created via this flag
    (server-enforced).
  - `components/DashboardClient.tsx` adds a prominent “⚡ Lightning” action card (seeds the
    topic from the Daily Topic when present). The roast result page
    (`components/roast/RoastClient.tsx`) cross-links into Lightning to convert
    roast → a real round.
  - **Runnable as-is.** Existing debate room, Realtime, scoring, finalize, and the verdict
    UI all drive it unchanged. Safe checkpoint.

#### Prior checkpoint
**Session:** Solo “roast my take” + mind archetype (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Solo “roast my take” — the lowest-friction hook (ROADMAP §2.5).** Paste any take
  (a tweet, a comment, a hot opinion) and the Oracle scores it instantly and names its
  fallacies. **NO opponent, NO rounds, NO matchmaking, NO DB writes, NO migration.**
  - `app/api/roast/route.ts` (`POST { take, stance? }`) reuses the existing neutral judge
    `scoreArgument()` (`lib/ai/judge.ts`) VERBATIM and returns `{ score, archetype }`. It
    writes nothing to the database — no debate/argument/topic row, no Elo — so it cannot
    affect the feed, ratings, or any existing flow. Auth-gated; cheap regex/length gate
    (`lib/moderation.ts`) + the same `moderateWithOracle` Gemini safety pass used on real
    arguments; fail-open rate limit `roast:<user>` 10/60s via `check_rate_limit` (0008).
    FAIL-OPEN throughout: if 0008 is absent the limit check allows; a Gemini error returns
    a clean 503 the UI handles.
  - `lib/ai/archetype.ts` — a PURE function (no I/O) mapping a `ScoreResult` to a “mind
    archetype” title + blurb (§2.5 force 3). Reusable later for profiles/recaps.
  - `app/roast/page.tsx` (server, auth-gated) + `app/roast/loading.tsx` (`OracleLoader`) +
    `components/roast/RoastClient.tsx` (client island) implement the §2.5 force-1 tuned
    verdict reveal: submit → a ~1.8s “Oracle deliberates” held-breath beat → dimensions
    count up one at a time → fallacy call-outs land LAST → mind-archetype payload → X share
    intent. Oracle Terminal aesthetic throughout (glass cards, Cinzel/Crimson/Share-Tech,
    CSS vars, `reveal-*` + `oracle-fade-in`/`oracle-pulse`).
  - Surfaced via a `ROAST` link in `Navbar` (after DEBATES) and a secondary CTA under the
    landing hero (“or roast a take — no opponent, instant verdict”).
  - **Runnable as-is: NO migration, NO schema, NO env change.** This is the first build
    checkpoint of the §2.4/§2.5 realignment; safe to stop here.

#### Prior status
` needs updating after each session.
> Everything above is stable reference — do not edit unless the plan fundamentally changes.

---

## 1. Concept

A competitive, turn-based, real-time AI-judged debate platform.
**Tagline:** "Being a keyboard warrior is no longer easy."

Two players argue opposing sides of any topic across 2–5 rounds with a 10-minute timer per turn.
After each argument, Google Gemini AI scores it across 5 dimensions and detects logical fallacies
by name, quoting the offending phrase and explaining the penalty.
Players earn an Elo rating that rises and falls with every ranked match.
The scored result card is shareable — this is the viral mechanic.

**Live at:** argos-indol.vercel.app
**Target audience:** People who debate on Twitter, Reddit, and Instagram. Competitive, opinionated, social.

---

## 2. AI Provider Strategy

### Current: Google Gemini
- **Model:** `gemini-3.1-flash-lite` (as used in judge.ts and dailyTopic.ts)
- **SDK:** `@google/generative-ai` (official Google Node.js SDK)
- **Key env var:** `GEMINI_API_KEY` — server-side only, NEVER in any NEXT_PUBLIC_ variable

### Future upgrade path: Anthropic Claude
The entire AI layer is isolated in two files: `lib/ai/judge.ts` and `lib/ai/prompts.ts`.
To switch providers, ONLY `lib/ai/judge.ts` changes. Exported interface never changes.

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.2.7 (App Router) |
| React | 19.2.4 |
| Styling | Tailwind CSS v4 + custom CSS design system |
| Components | shadcn/ui |
| Database | Supabase (Postgres + Realtime + Auth) |
| ORM | Drizzle ORM |
| Auth | Supabase Auth (Google OAuth) |
| AI Judge | Google Gemini via @google/generative-ai |
| Email | Resend v6 |
| Error monitoring | Sentry |
| Analytics | Posthog |
| Deployment | Vercel (with Vercel Cron) |
| Fonts | Cinzel, Cinzel Decorative, Crimson Pro, Share Tech Mono |

---

## 4. Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-only, used in score route + crons

# AI
GEMINI_API_KEY=                  # server-only

# App
NEXT_PUBLIC_APP_URL=https://argos-indol.vercel.app

# Email (Resend)
RESEND_API_KEY=                  # enables turn notifications
RESEND_FROM_EMAIL=               # must be a verified Resend sender/domain
                                 # default: Argos <notifications@argos-indol.vercel.app>

# Cron auth
CRON_SECRET=                     # shared secret for /api/cron/* routes

# Sentry / Posthog (already configured)
```

---

## 5. Database Schema (complete, including all migrations)

```sql
-- Core tables (existed before Phase 8 session)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  elo_rating    INTEGER DEFAULT 1200,
  debates_won   INTEGER DEFAULT 0,
  debates_lost  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE topics (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title     TEXT NOT NULL,
  category  TEXT,
  source    TEXT DEFAULT 'user'   -- 'user' | 'matchmaking' | 'daily_topic'
);

CREATE TABLE debates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        UUID REFERENCES topics(id),
  player_a_id     UUID REFERENCES users(id),
  player_b_id     UUID REFERENCES users(id),
  player_a_side   TEXT NOT NULL,
  mode            TEXT NOT NULL,   -- 'ranked' | 'casual'
  status          TEXT DEFAULT 'waiting',  -- waiting|active|scoring|completed
  current_turn    UUID REFERENCES users(id),
  total_rounds    INTEGER DEFAULT 3,
  current_round   INTEGER DEFAULT 1,
  winner_id       UUID REFERENCES users(id),
  is_public       BOOLEAN DEFAULT true,    -- added Phase 8 session
  turn_started_at TIMESTAMPTZ,             -- added Phase 8 session
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE arguments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id       UUID REFERENCES debates(id),
  user_id         UUID REFERENCES users(id),
  round_number    INTEGER NOT NULL,
  content         TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ DEFAULT now(),
  score_total     INTEGER,
  score_clarity   INTEGER,
  score_evidence  INTEGER,
  score_logic     INTEGER,
  score_rebuttal  INTEGER,
  fallacy_penalty INTEGER DEFAULT 0,
  fallacies_found JSONB DEFAULT '[]',
  ai_feedback     TEXT,
  scoring_status  TEXT DEFAULT 'pending'  -- pending|scoring|done|failed
);

CREATE TABLE elo_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  debate_id   UUID REFERENCES debates(id),
  elo_before  INTEGER,
  elo_after   INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID REFERENCES users(id),
  topic_id    UUID REFERENCES topics(id),
  status      TEXT DEFAULT 'open',  -- open | accepted
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- New tables added in Phase 8 session
CREATE TABLE matchmaking_queue (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id),
  elo_rating         INTEGER DEFAULT 1200,
  status             TEXT DEFAULT 'waiting',  -- waiting | matched
  matched_debate_id  UUID REFERENCES debates(id),
  joined_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD UTC
  title       TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE argument_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  argument_id    UUID NOT NULL REFERENCES arguments(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  reaction_type  TEXT NOT NULL,  -- 'strong' | 'brutal' | 'questionable'
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (argument_id, user_id)
);

-- vs Oracle AI mode (migration 0006). One fixed-UUID system user reused as
-- player_b for every vs-AI debate. Referenced in code as ORACLE_USER_ID in
-- lib/ai/oracle.ts. oracle_debates_today(user) caps vs-AI debates to 3/day.
-- The Oracle is a normal row in `users` (id 00000000-0000-0000-0000-0000000000a1,
-- username 'Oracle'); vs-AI debates are always mode = 'casual'.

-- Trust & safety (migration 0007): tables `reports` and `user_blocks`, plus
-- match_player() skips mutually-blocked users. Rate limiting + anti-Sybil
-- (migration 0008): table `rate_limits` + check_rate_limit(), and nullable
-- users.signup_ip_hash / debates.suspected_sybil. All applied; 0007/0008 app
-- wiring is the next FREE roadmap work.

-- Recommended indexes (not yet applied — run these)
CREATE INDEX IF NOT EXISTS idx_debates_player_a ON debates(player_a_id);
CREATE INDEX IF NOT EXISTS idx_debates_player_b ON debates(player_b_id);
CREATE INDEX IF NOT EXISTS idx_debates_status   ON debates(status);
CREATE INDEX IF NOT EXISTS idx_arguments_debate  ON arguments(debate_id);
CREATE INDEX IF NOT EXISTS idx_users_elo         ON users(elo_rating DESC);
```

### Migration script (run ALL of these on Supabase if starting fresh from the old schema)
```sql
ALTER TABLE debates ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE debates ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  elo_rating integer DEFAULT 1200,
  status text DEFAULT 'waiting',
  matched_debate_id uuid REFERENCES debates(id),
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date text NOT NULL UNIQUE,
  title text NOT NULL,
  category text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS argument_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  argument_id uuid NOT NULL REFERENCES arguments(id),
  user_id uuid NOT NULL REFERENCES users(id),
  reaction_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (argument_id, user_id)
);
```

### Supabase Realtime — enable on these tables
- `debates` (already enabled)
- `arguments` (already enabled)
- `matchmaking_queue` (NEW — enable for instant match UX)

---

## 6. Repo Structure (complete)

```
argos/
├── app/
│   ├── api/
│   │   ├── challenges/
│   │   │   ├── route.ts                  # POST: post an open challenge
│   │   │   └── [id]/accept/route.ts      # POST: accept challenge -> create debate
│   │   ├── cron/
│   │   │   ├── auto-forfeit/route.ts     # GET: forfeit idle turns >11min (every 5min)
│   │   │   └── daily-topic/route.ts      # GET: generate daily topic (00:00 UTC)
│   │   ├── debates/
│   │   │   ├── route.ts                  # POST: create debate (opponentType:'ai' => vs Oracle)
│   │   │   └── [id]/
│   │   │       ├── route.ts              # GET: state, PATCH: join/update turn
│   │   │       ├── argument/route.ts     # POST: submit argument (+ triggers Oracle turn)
│   │   │       └── oracle-turn/route.ts  # POST: drive the Oracle's move (internal secret)
│   │   ├── matchmaking/route.ts          # POST/GET/DELETE: ranked queue
│   │   ├── notify-turn/route.ts          # POST: send turn email via Resend
│   │   ├── og/route.tsx                  # GET: OG image for share cards
│   │   ├── reactions/route.ts            # GET/POST: argument reactions
│   │   └── score/route.ts               # POST: invoke Gemini judge + settle Elo
│   ├── auth/
│   │   ├── callback/route.ts
│   │   ├── error/page.tsx
│   │   └── signout/route.ts
│   ├── challenges/
│   │   ├── page.tsx                      # Open challenges lobby (server)
│   │   └── loading.tsx
│   ├── dashboard/
│   │   ├── page.tsx                      # Server: fetches stats + daily topic
│   │   └── loading.tsx
│   ├── debate/
│   │   ├── new/page.tsx                  # Client: topic/mode/rounds; reads ?topic= param
│   │   ├── new/loading.tsx
│   │   └── [id]/
│   │       ├── page.tsx                  # Server: hydrates DebateRoom
│   │       └── loading.tsx
│   ├── debates/
│   │   ├── page.tsx                      # Public feed (server, no auth required)
│   │   └── loading.tsx
│   ├── leaderboard/
│   │   ├── page.tsx
│   │   └── loading.tsx
│   ├── profile/[username]/
│   │   ├── page.tsx
│   │   └── loading.tsx
│   ├── login/page.tsx
│   ├── error.tsx
│   ├── global-error.tsx
│   ├── globals.css                       # Oracle Terminal design system
│   ├── layout.tsx
│   ├── not-found.tsx
│   └── page.tsx                          # Landing page (redirects to /dashboard if authed)
├── components/
│   ├── auth/LoginButton.tsx
│   ├── challenges/
│   │   └── ChallengeLobby.tsx            # Client: post + accept challenges
│   ├── debate/
│   │   ├── ArgumentReactions.tsx         # Client: optimistic reaction chips
│   │   ├── DebateRoom.tsx                # Client: full debate state machine
│   │   └── ScoreBreakdown.tsx            # Animated score bars + fallacy cards
│   ├── ui/
│   │   ├── ThemeToggle.tsx
│   │   └── button.tsx
│   ├── CircuitBackground.tsx
│   ├── DailyTopicBanner.tsx              # Server: daily topic card with CTA
│   ├── DashboardClient.tsx               # Client: count-up stats, matchmaking
│   ├── MatchmakingButton.tsx             # Client: find opponent, Realtime + poll
│   ├── Navbar.tsx                        # Client: sticky nav, JOIN bar, DEBATES/LOBBY/RANKS
│   ├── OracleLoader.tsx
│   ├── PosthogProvider.tsx
│   └── ThemeProvider.tsx
├── lib/
│   ├── ai/
│   │   ├── dailyTopic.ts                 # Gemini daily topic generator + fallback list
│   │   ├── judge.ts                      # Gemini SDK — scoring (the judge)
│   │   ├── oracle.ts                     # Gemini SDK — arguing (vs Oracle AI mode) + ORACLE_USER_ID
│   │   └── prompts.ts                    # Judge + Oracle argue prompt templates
│   ├── db/
│   │   └── schema.ts                     # Drizzle schema (all tables)
│   ├── debates/
│   │   └── finalize.ts                   # finalizeIfComplete(): settle Elo on forfeit
│   ├── email/
│   │   └── resend.ts                     # sendTurnNotification(): fail-safe email
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── dailyTopic.ts                     # getTodayTopic() + todayUtc() helpers
│   ├── debates.ts                        # fetchDebateHistory() shared helper
│   ├── matchmaking.ts                    # attemptMatch(): Elo-band pairing + race guard
│   ├── moderation.ts                     # moderateContent() profanity/length filter
│   └── utils.ts
├── vercel.json                           # Cron: auto-forfeit (*/5) + daily-topic (00:00 UTC)
├── PROJECT.md                            # This file
└── [config files: next.config.ts, tsconfig.json, drizzle.config.ts, etc.]
```

---

## 7. AI Judge — Scoring System

Scores each argument independently across 5 dimensions (max 80 pts).
Evaluates argumentation quality ONLY — never whether the position is factually correct.

| Dimension | Max | What is measured |
|-----------|-----|------------------|
| Clarity | 20 | Is the position explicitly stated? |
| Evidence | 20 | Quality of sources cited |
| Logic | 20 | Does conclusion follow from premises? |
| Rebuttal | 20 | Did you address the opponent's specific points? |
| Fallacy penalty | -1 to -15 | Subtracted. Each fallacy named, quoted, explained. |

Fallacies detected: Ad hominem, Straw man, False dichotomy, Appeal to authority,
Slippery slope, Cherry picking, Circular reasoning, Anecdotal evidence, Bandwagon, Moving goalposts.

Prompt lives in `lib/ai/prompts.ts`. Judge in `lib/ai/judge.ts` (3 retries on 503/429).

---

## 8. Elo System

- Starting Elo: 1200
- K-factor: 32 for players with <30 debates, 16 for 30+
- Updated only for `mode = 'ranked'` debates
- Win/loss counts updated for both ranked and casual
- History recorded in `elo_history` table
- Settlement logic lives in two places (both must stay in sync):
  - `app/api/score/route.ts` — normal debate completion
  - `lib/debates/finalize.ts` — forfeit-completed debates

---

## 9. Key Patterns & Conventions

### New server page
```typescript
// app/[route]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { CircuitBackground } from "@/components/CircuitBackground";

export default async function RoutePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <CircuitBackground intensity={1.0} />
      <Navbar username={username} />
      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "3rem 1.5rem 4rem", position: "relative", zIndex: 1 }}>
        {/* content with reveal-1, reveal-2... classes */}
      </main>
    </div>
  );
}
```

### New loading screen
```typescript
// app/[route]/loading.tsx
import { OracleLoader } from "@/components/OracleLoader";
export default function Loading() {
  return <OracleLoader label="Entering the arena…" />;
}
```

### New API route
```typescript
// app/api/[route]/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...
}
```

### Cron route auth pattern
```typescript
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  if (request.headers.get("x-vercel-cron") === "1") return true;
  return false;
}
```

### Design system rules (NEVER break these)
- **No `onMouseEnter`/`onMouseLeave` in server components** — CSS only
- **CSS variables only** — never hardcoded colors
- **Every new page:** `<CircuitBackground intensity={1.0} />` + `<Navbar />`
- **Every new route:** `loading.tsx` using `<OracleLoader />`
- **Staggered reveal:** `.reveal-1`, `.reveal-2`, ... `.reveal-6`
- **Fonts:** headings → `var(--font-cinzel)`, body → `var(--font-crimson)`, data → `var(--font-share-tech)`
- **Cards:** `.glass-card` + `.glass-card-gold` (primary) or `.glass-card-teal` (secondary)
- **Layout:** inline styles for sizing/layout, CSS classes for theme-dependent colors
- **`useSearchParams`** requires Suspense boundary — use `window.location.search` in `useEffect` instead

---

## 10. UI Design System — Oracle Terminal

"An ancient debate institution that gained sentience. Gold leaf meets circuit boards."

### Color tokens (CSS variables in globals.css)
- `--bg-void` / `--bg-surface` / `--bg-elevated` / `--bg-glass` — backgrounds
- `--gold` / `--gold-bright` / `--gold-dim` / `--gold-glow` / `--gold-border` — primary accent
- `--teal` / `--teal-dim` / `--teal-glow` / `--teal-border` — tech accent
- `--red-neon` / `--red-glow` / `--red-border` — fallacy/danger
- `--text-primary` / `--text-secondary` / `--text-tertiary` / `--text-gold` / `--text-teal`

### Key CSS classes
- `.glass-card` — liquid glass: `backdrop-filter: blur(16px)`, gold border, shadow
- `.glass-card-gold` / `.glass-card-teal` — colored top border variants
- `.btn-oracle` — primary CTA: gold fill, Cinzel, hover lift + glow
- `.btn-ghost` — secondary: transparent, gold border on hover
- `.oracle-input` — form fields: dark glass, gold focus ring
- `.gold-rule` / `.gold-rule-subtle` — decorative dividers
- `.badge-for` / `.badge-against` — gold/teal side pills
- `.scanlines` — CRT scanline overlay
- `.text-shimmer` — animated gold shimmer
- `.reveal-1` through `.reveal-6` — staggered fade-up animations
- `.cursor-blink` — blinking pipe cursor

### Navbar links (left to right in nav)
ARGOS wordmark → DEBATES → LOBBY → RANKS → JOIN button → username → DEPART

---

## 11. Feature Status

> **This section is historical build phasing.** For the authoritative, current
> status of every feature (BUILT / IN PROGRESS / NEXT / LATER, FREE vs PAID), use
> the **Build Ledger in `ROADMAP.md` §5**. Everything in Phases 1–4 below is
> **merged + deployed**; the "in review as MRs" notes are historical.

### Phase 1 — Retention (COMPLETE, deployed)
- [x] **Public debate feed** `/debates` — completed public debates, filters: Recent/Most discussed/By Category
- [x] **Open challenges lobby** `/challenges` — post a motion, accept one, no invite needed
- [x] **Turn email notifications** — Resend, fires after every turn advance + forfeit, fail-safe
- [x] **Auto-forfeit cron** — every 5min, forfeits idle turns >11min, settles Elo
- [x] **Server-anchored timer** — `turn_started_at` stamped on every turn begin
- [x] **X/Twitter share button** — intent link with topic+score, OG image auto-previews
- [x] **Score API security** — participant check before scoring (403 for non-participants)

### Phase 2 — Growth (COMPLETE, in review as MRs !5–!7)
- [x] **Ranked matchmaking** `/api/matchmaking` — Elo-band pairing (200→500→∞), Realtime + poll, race-safe
- [x] **Argument reactions** — 💡 Strong · 🔥 Brutal · ⚠️ Questionable, optimistic toggle, on completed debates
- [x] **Daily Topic** — Gemini-curated at 00:00 UTC, fallback list, shown on dashboard with "Debate this" CTA

### Phase 2 — Remaining
- [ ] **Debate titles/badges (#9)** — Elo milestones + achievement badges on profile
- [ ] **Debate replay (#10)** — `/debate/[id]/replay` timeline view, scroll-animate scores

### Phase 3 — Monetisation (not started)
- [ ] Argos Pro ($6/mo via Stripe) — unlimited ranked, AI coaching, private rooms
- [ ] Debate clubs — private orgs with invite codes
- [ ] Tournament mode — bracket, entry fee, prize pool
- [ ] Scoring API access — metered billing

### Phase 4 — Depth (not started)
- [ ] Cross-round AI memory — judge sees full transcript, tracks consistency
- [ ] vs Oracle AI mode — Gemini plays the opposing side
- [ ] Category-specific leaderboards + radar chart on profile

### Technical debt (not started)
- [ ] DB indexes (SQL above)
- [ ] Paginate leaderboard + Chronicle
- [ ] Split DebateRoom.tsx (~400 lines) into hooks + sub-components
- [ ] Optimistic UI on argument submission
- [ ] Mobile: auto-resize textarea, padding-bottom on debate room

---

## 12. Open MRs — MERGE THESE IN ORDER

All 7 MRs are open and mergeable. They are stacked — merge in this exact order:

| Order | MR | Branch | What |
|-------|----|--------|------|
| 1st | !1 | `feat/public-debate-feed` | Public feed + score security fix |
| 2nd | !2 | `feat/lobby-and-share` | Challenges lobby + X share + nav links |
| 3rd | !3 | `feat/auto-forfeit-timer` | Auto-forfeit cron + turn_started_at |
| 4th | !4 | `feat/turn-email-notifications` | Turn emails via Resend |
| 5th | !5 | `feat/ranked-matchmaking` | Ranked matchmaking queue |
| 6th | !6 | `feat/daily-topic` | Daily Topic cron + dashboard banner |
| 7th | !7 | `feat/argument-reactions` | Argument reactions |

**After merging all 7, run the migration SQL from Section 5 on Supabase.**

---

## 13. Security Checklist

> **Open items here are the INTEGRITY pillar (Pillar 1) in `ROADMAP.md` §4.1 / §5.2.**
> They are the highest-priority NEXT work — not optional polish. Risk IDs (R1–R12) map to
> `ROADMAP.md` §3.2.

**Done / in place:**
- [x] `.env.local` in `.gitignore`
- [x] `GEMINI_API_KEY` server-side only
- [x] `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] RLS enabled on all Supabase tables (+ explicit read RLS, migration 0012)
- [x] Sentry + PostHog installed
- [x] Regex/length moderation gate + fail-open Gemini safety pass on arguments
- [x] Score API participant check (403 for non-participants)
- [x] Cron + internal routes protected by `CRON_SECRET` + `x-vercel-cron` header
- [x] Challenge accept: race guard prevents double-accept
- [x] Matchmaking: two-row atomic claim with rollback
- [x] Rate limiting on debate creation (20/day) + matchmaking (30/60s) + score (60/60s)
- [x] OAuth callback open-redirect closed (`safeNextPath`)
- [x] Report / block + soft anti-Sybil flagging (migrations 0007/0008)

**OPEN — NEXT (Pillar 1, see `ROADMAP.md` §6):**
- [ ] **(R1) Prompt-injection isolation in the judge** — user content is concatenated raw
      into `lib/ai/prompts.ts`; clamp protects range, not injected in-range scores. Isolate
      content + prefer structured output. **CRITICAL — ranked-integrity.**
- [ ] **(R3) Topic moderation** — topics are length-validated only, then hit the judge
      prompt + public feed + OG cards unmoderated.
- [ ] **(R2) Moderation under failure** — safety pass is fail-open; make it
      fail-closed/queue-for-review for new/low-Elo users + add a free moderation API layer.
- [ ] **(R5/R11) Gemini global budget breaker** — a daily global ceiling independent of the
      internal-secret exemption; treat `CRON_SECRET` as high-value (rotate, long/random).
- [ ] **(R4) Real anti-Sybil** — provisional rank until N distinct opponents; consider
      voiding ranked Elo on abandonment/ghost.
- [ ] **(R9) Monitoring/alerts** for every fail-open path (Gemini error rate, moderation
      fail-open rate, scoring-queue depth, ghost debates).
- [ ] **(R10) Tests** for `submit_argument`, `match_player`, finalize, Elo math.

---

## 14. Vercel Cron Schedule

```json
{
  "crons": [
    { "path": "/api/cron/auto-forfeit", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/daily-topic",  "schedule": "0 0 * * *" }
  ]
}
```

To seed today's daily topic immediately (without waiting for midnight):
```
curl -H "Authorization: Bearer $CRON_SECRET" https://argos-indol.vercel.app/api/cron/daily-topic
```

---

## 15. Current Status

> **STRATEGY MOVED:** the forward plan now lives in **`ROADMAP.md` (v2.0,
> integrity-first, distribution-led)**. Read it first. The checkpoints below are the
> **build history** (most recent first) and remain useful as a record of *how* each
> feature was built. For *what to build next*, use `ROADMAP.md` §5 (Build Ledger) + §6
> (Execution order). The immediate NEXT work is the **INTEGRITY pillar** (prompt-injection
> isolation, topic moderation, fail-safe moderation, Gemini budget breaker), then the two
> growth loops (anonymous landing roast + weekly "mind" recap), then funnel instrumentation.
>
> **GROUND TRUTH (read this first):** Everything described anywhere in this file
> is **MERGED to `main`**, and **all migrations `0002`–`0019` are APPLIED** in
> Supabase. Ignore any older "awaiting merge" / "run this migration" wording
> below — it is historical. The Gemini model in use is real and working.
>
> **Hard constraint:** no budget. Everything stays on **free tiers only**. Cron
> is limited — 2 daily Vercel crons (`daily-topic`, `maintenance`) plus a
> best-effort ~5-min GitHub Actions ping of `/api/cron/maintenance`. Do not add
> features that assume paid cron, paid Realtime, or any paid service.

**Session:** Anonymous (logged-out) spectating (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Anyone can now watch a public debate without signing in.** This is the
  deferred Phase 3 follow-up and amplifies the Live surface + spectator work:
  a logged-out visitor opening `/debate/[id]` (e.g. from `/live`, the public
  feed, or a shared link) gets the read-only spectator view.
  - Server page `app/debate/[id]/page.tsx` no longer hard-redirects logged-out
    viewers to `/login`. It treats them as a spectator (empty viewer id),
    applies the same `authorizeAndSanitizeDebate` guard (private → redirect;
    newest unscored in-flight move still withheld), and only sends a logged-out
    viewer to `/login` for a `waiting` debate (nothing to watch + join needs
    auth).
  - `GET /api/debates/[id]` (which the room polls) likewise allows anonymous
    reads of public debates instead of 401ing.
  - DB already permits this: the `0012` RLS SELECT policies are
    `coalesce(is_public,true) OR participant`, so a null `auth.uid()` still
    reads public debates + their arguments. NO new migration.
  - `DebateRoom` handles an empty `currentUserId`: anonymous viewer is always a
    spectator, gets a stable random presence key (so logged-out watchers aren't
    collapsed into one count), and the participatory features are disabled —
    `AudienceVote` gains `canVote` (shows the live crowd split but a “Sign in to
    vote” hint) and `ArgumentReactions` is passed `canReact={false}`. A “Sign in
    to debate & vote” CTA appears in the spectator banner. The Navbar already
    renders the logged-out “ENTER” state.
  - Runnable as-is, NO migration, NO schema change.

#### Prior checkpoint — Smooth + fast random matching UX (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Random matching now feels instant and smooth even when connections lag.**
  Pure client-side UX polish in `components/MatchmakingButton.tsx` — NO API or
  schema change, so it is fully backward compatible.
  - **Snappier pairing:** the queue poll now runs every **1.5s for the first
    ~20s**, then backs off to 4s. Most matches happen early, so the tight early
    cadence makes pairing feel near-instant; the back-off keeps the long tail
    cheap and well within the 30/60s matchmaking rate limit. (The *matched*
    player is still found instantly via Realtime; polling is the waiting
    player's fallback + widening re-attempt.)
  - **Smooth handoff:** on a match (Realtime OR poll OR the initial POST) the
    card shows a brief **“Opponent found — entering the arena”** success flash
    (gold pulse + fill bar) for ~0.9s, then navigates — so the connection reads
    as intentional, not an abrupt redirect. A single `handledRef` guard makes
    the handoff fire exactly once even if Realtime and the poll resolve
    together.
  - **Active-progress feel:** earlier, gentler staged status text (5s / 30s /
    90s) plus an animated shimmer bar so the wait looks like progress.
  - We also no longer fire the “leave queue” unload beacon once a match is
    found (we’re navigating into it), preventing a self-cancel race.

#### Prior checkpoint — Connection-only emails (remove per-turn notifications) (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Argos now sends exactly ONE gameplay email: a “you’re connected for a
  debate” note to both players when they are matched / a challenge is
  accepted.** Per-turn emails were removed — they were unnecessary and noisy
  (e.g. starting Quick Match on a phone, waiting on a laptop, then getting
  pinged every single turn). New `sendMatchNotification(debateId)` in
  `lib/email/resend.ts` emails BOTH human seats once (skips the Oracle, returns
  0–2, no-op without `RESEND_API_KEY`). Wired into `/api/matchmaking` (POST +
  GET on match) and `/api/challenges/[id]/accept`. `sendTurnNotification` is now
  an inert no-op; its call sites were removed from `/api/debates/[id]/argument`
  and the maintenance-cron forfeit step, and `/api/notify-turn` is a harmless
  no-op route. NO migration, NO schema. Runnable as-is.
- ℹ️ Invites/challenges already create the debate via the accept route, so the
  same single connection email covers “someone challenged/invited you” — no
  separate email path needed.

#### Prior checkpoint — Quick Match country flags (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Opponents (and Live spectators) see each other's country with a flag.**
  New nullable `users.country` (ISO 3166-1 alpha-2) is populated best-effort at
  matchmaking time from the edge geo header (`x-vercel-ip-country`, Cloudflare
  fallback) — first-sight only, never overwritten, exactly like the anti-Sybil
  IP-hash backfill (`lib/safety/country.ts` → `backfillCountry`, wired into
  `/api/matchmaking` POST + GET). `lib/country.ts` is a pure, null-safe code→
  flag-emoji + name helper. The debate room shows each side's flag in the score
  tribune (You / Opp.) and the `/live` page shows a flag beside each player.
  FULLY FAIL-OPEN: no header (local dev) or pre-0017 column → no flag, nothing
  breaks.
- ⚠️ **Run `supabase/migrations/0017_user_country.sql`** — `alter table users
  add column if not exists country text`. Additive + **idempotent (safe to run
  twice)**. The app is fully runnable BEFORE or AFTER applying it (the country
  read just returns null → no flag until backfilled).

#### Prior checkpoint — Live spectator watches the COMPLETE debate (FREE)
**Date:** 2026-06-28

### This checkpoint
- ✅ **Spectators now watch the full debate live, not just the current round.**
  The prior redaction hid the ENTIRE in-flight round from spectators, so a
  viewer (especially a late joiner) only ever saw rounds strictly before the
  current one. Now a spectator sees every past round AND every already-scored
  argument in the current round; the ONLY thing withheld on a live debate is
  the single newest, NOT-YET-SCORED in-flight argument, revealed the instant
  the Oracle scores it (or the opponent responds and a higher round exists).
  This keeps the no-peek fairness guarantee while letting the crowd follow the
  whole match. Spectators still cannot argue (input gated by `isMyTurn`).
  Changed in lockstep: `lib/debates/visibility.ts` (server guard, used by the
  debate page + `GET /api/debates/[id]`) and `components/debate/DebateRoom.tsx`
  `visibleArguments` (client defense-in-depth for Realtime rows). NO migration,
  NO schema. Runnable as-is.

#### Prior checkpoint — hide blocked users from the public feed (FREE)
**Date:** 2026-06-27

### This checkpoint
- ✅ **Hide blocked users from the public feed.** Completes the deferred
  follow-up from the block feature (migration 0007). The `/debates` page now
  fetches the viewer's block set (either direction, from `user_blocks`) and
  filters out any debate where either player is blocked — **in SQL**, so
  pagination counts stay accurate. Logged-out viewers are unaffected.
- ⚠️ **Run `supabase/migrations/0016_feed_player_ids.sql`** — recreates the
  `public_debate_feed` view adding `player_a_id` / `player_b_id` (the keys to
  filter on); all existing columns unchanged. DROP + CREATE, **idempotent /
  safe to run twice.**
- **Runnable before OR after 0016:** the block filter references the new id
  columns and is only attempted when the viewer has blocks; if that query
  errors (columns missing pre-0016) the page transparently falls back to the
  unfiltered feed. A fresh query builder is used per attempt to avoid
  PostgREST filter-builder mutation leaking across attempts.

#### Prior checkpoint — Phase 5 plumbing (is_pro + usage metering, FREE)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Monetization plumbing (Phase 5 FREE items 1-2) — NO user-facing change.**
  Builds the paywall foundation so flipping it on later is a one-line change,
  while charging NO ONE during beta. `lib/billing/limits.ts` is the single
  source of truth: `BETA_UNLIMITED = true` keeps `getEntitlements().enforced`
  false, so `isActionAllowed()` always returns true and nothing is blocked.
  `FREE_LIMITS` mirror today's hard-coded caps (20 debates/day, 3 oracle/day)
  so switching the paywall on never silently tightens current behaviour;
  `PRO_LIMITS` are generous-but-bounded.
- ✅ **Durable usage metering.** `lib/billing/usage.ts` wraps `record_usage()`
  / `usage_today()` / the `is_pro` read — all **FAIL-OPEN**: if migration 0015
  isn't applied yet, reads return 0, writes no-op, `fetchIsPro` returns false,
  so the route behaves exactly as before via the existing caps. Wired into
  `POST /api/debates`: an (inert-during-beta) entitlement check before create,
  and `record_usage` after a successful create.
- ⚠️ **Run `supabase/migrations/0015_pro_and_usage.sql`** — adds `users.is_pro`,
  the `daily_usage` table, and `record_usage()` / `usage_today()`. **Idempotent
  — safe to run twice.** App is fully runnable before OR after applying it.
- Drizzle schema updated to match (`users.isPro`, `dailyUsage` table).

#### Prior checkpoint — “Live now” discovery surface (Phase 3 follow-up, FREE)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **“Live now” discovery surface — NO migration, NO schema.** New `/live`
  server page lists currently **active + public** debates so anyone can find
  and spectate a match in progress. It reuses existing tables only — a single
  PostgREST query on `debates` (`status='active'` AND `is_public=true`) that
  embeds the topic + both players via the existing FK references — ordered by
  `turn_started_at` desc, capped at 50. Each card shows the topic, category,
  round X/Y, a ⚡ Blitz tag, both players + their FOR/AGAINST sides, and a
  “Watch live” CTA linking to `/debate/[id]` (the read-only spectator view
  already shipped). Empty state offers a “Start the next one” CTA.
  `app/live/page.tsx` + `app/live/loading.tsx` (`OracleLoader`); a `LIVE` nav
  link with a pulsing red dot was added to `Navbar` (before DEBATES) and the
  `.nav-live-dot` keyframe to `globals.css`. Runnable as-is.

#### Prior checkpoint — presence-based Quick Match (Phase 4, FREE)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Quick Match (instant Blitz pairing) + live online count.** Dashboard now
  has a "Quick Match" card that drops you into the ranked queue and pairs into a
  fast ⚡ Blitz debate, plus an `OnlinePresence` "N online" pill (global Realtime
  presence channel `presence:lobby`, no DB). The matchmaking pipeline is reused
  end-to-end; `MatchmakingButton` gained a `blitz` variant, the API threads the
  flag (POST body + `?blitz=1` on the poll), and `attemptMatch(userId,{blitz})`
  calls `match_player_v2`.
- ⚠️ **Run `supabase/migrations/0014_match_player_blitz.sql`** — adds
  `match_player_v2(p_user_id, p_blitz)` (a copy of `match_player` that stamps
  `debates.blitz`). **Idempotent (create or replace) — safe to run twice.**
  Until it's applied, Quick Match transparently falls back to `match_player`
  and produces a standard debate — the app is fully runnable either way.
- Cleanup: replaced the stale "Debate vs AI — Soon" card (vs-Oracle already
  shipped) with Quick Match; dashboard rank label now uses `getTitle`.

#### Prior checkpoint — Debate replay (Phase 3, FREE)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Debate replay — NO migration, NO schema.** `/debate/[id]/replay` replays a
  completed debate argument-by-argument with a running per-player score tally,
  play/pause + prev/next/restart, and the existing `ScoreBreakdown` reveal.
  Server page `app/debate/[id]/replay/page.tsx` authorizes via the shared
  `authorizeAndSanitizeDebate` (private debates hidden from non-participants;
  non-completed debates redirect to the live room). Client component
  `components/debate/DebateReplay.tsx`; `loading.tsx` uses `OracleLoader`. A
  "▶ Watch Replay" link was added to the completed result card. Reuses existing
  data only. Runnable as-is.

#### Prior checkpoint — Achievements / titles / badges (Phase 3, FREE)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Achievements / titles / badges — NO migration, NO schema.** Computed on
  the fly from existing data. `lib/achievements.ts` is pure: `getTitle(elo)`
  (single Elo-driven rank) + `computeBadges()` (first win, debate-count
  milestones, win-rate, fallacy-free counts, Elo tiers). The profile page
  derives `scoredArguments` / `fallacyFreeArguments` from a capped read of the
  user's `scoring_status='done'` arguments (`fallacies_found` empty = clean),
  uses `getTitle` for the rank line (replacing the old inline 3-tier label),
  and renders `components/profile/Achievements.tsx` (earned glow / locked
  dimmed-as-goals, CSS-vars only, a11y labels, no client JS). Runnable as-is.

#### Prior checkpoint — Live realtime feed fix + settlement refactor
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Fixed the live-feed inconsistency in sequential debates.** Debates are
  strictly sequential (`submit_argument` flips `current_turn` each move), but a
  prior anti-peek redaction assumed simultaneous play and hid the opponent's
  just-submitted argument from the player whose turn it was until they
  themselves submitted (or scoring finished). The author's own screen looked
  fine — read as a desktop/mobile bug but was author-vs-opponent. Now
  participants always see every submitted argument the instant it lands
  (Realtime + the 8s poll); only **spectators** are kept out of the single
  in-flight round on a live debate. `lib/debates/visibility.ts` +
  `DebateRoom.tsx` `visibleArguments`. No migration.
- ✅ **Added a chat-app “Opponent is typing…” indicator.** Ephemeral Supabase
  Realtime **broadcast** (no DB writes), throttled 1/s with an idle auto-clear
  so it never sticks on a dropped mobile socket. `components/debate/TypingPresence.tsx`,
  wired into `DebateRoom`.
- ✅ **Removed the dual Elo-settlement footgun.** `finalize.ts` (normal
  completion) and `forfeit.ts` (resign/ghost) duplicated identical Elo + stats
  math. Extracted `lib/debates/settle.ts` (`settleResult`); both now call it, so
  rating logic lives in one place. Behaviour unchanged. No migration.

#### Prior checkpoint — Deep-dive security hardening (cont.)
**Date:** 2026-06-27 (archived)

### This checkpoint
- ✅ **Made the public feed reproducible (migration 0013).** `app/debates/page.tsx`
  queries a `public_debate_feed` view that no tracked migration created — it lived
  only in the deployed DB, so a fresh setup from this repo would error on `/debates`.
  `0013` defines the view (completed + public debates; the exact columns the page
  reads) via DROP + CREATE so it applies cleanly over the unknown live shape and is
  safe to run twice. **Run `supabase/migrations/0013_public_debate_feed.sql`.**
- ℹ️ Audited the remaining frontend — `new-debate`, `Navbar`, `MatchmakingButton`,
  `ArgumentReactions`, landing page, `profile`, public feed, dashboard. All client
  components (mouse handlers OK), good a11y (`aria-pressed`/`aria-haspopup`/`role`),
  null-safe rendering, Suspense-free `useSearchParams` avoided via `window.location`.
  No bugs or UI inconsistencies found.

#### Earlier this checkpoint
- ✅ **Closed the client-side live-peek.** The server redaction (!9) didn't cover
  Supabase Realtime: `DebateRoom` subscribes to the `arguments` table, and RLS
  (0012) gates by participation — not by round — so a participant received the
  opponent's argument row the instant it was inserted, and the active render
  mapped over the full `debate.arguments`. Added a `visibleArguments` memo that
  mirrors `lib/debates/visibility.ts`: on a live debate, an opponent's round-N
  argument is hidden until the viewer authors round N. The active/scoring render
  and the running score tally now derive from it; completed view unchanged. No
  schema change.

#### Earlier this checkpoint
- ✅ **Fixed an OAuth open redirect.** `app/auth/callback/route.ts` redirected to
  `${origin}${next}` using the raw `next` query param; values like `next=//evil.com`
  or `next=/\evil.com` are treated by browsers as protocol-relative external URLs.
  New `lib/auth/safeRedirect.ts` (`safeNextPath`) accepts only a single-slash,
  same-origin local path (default `/dashboard`); the callback now always lands locally.
- ✅ **Turn emails never address the Oracle.** `sendTurnNotification` now short-circuits
  when `current_turn` is the Oracle system user (its move is driven by the oracle-turn
  route / cron, not email). No schema change.
- ℹ️ Completed the backend audit: auth callback/signout, both Supabase clients, matchmaking,
  daily-topic generator + fallback, and email HTML escaping all reviewed — no further issues.

#### Previous checkpoint
- ✅ **Closed a debate-visibility / fairness hole.** Both `app/debate/[id]/page.tsx`
  and `GET /api/debates/[id]` returned the full debate (every argument's `content`)
  to any authenticated user, gated only by RLS. New `lib/debates/visibility.ts`
  (`authorizeAndSanitizeDebate`) is wired into both read paths: non-participants can
  only view **public** debates, and on a **live** debate an opponent's in-flight
  argument is withheld until the viewer has submitted that round (no peeking before
  you commit). Completed/scoring debates still show in full.
- ✅ **OG image route no longer leaks private debates.** `/api/og` (public, unauth)
  renders the generic Argos card for `is_public = false` debates instead of their
  topic + scores.
- ✅ **Explicit DB-layer RLS (migration 0012).** `debates` + `arguments` get idempotent
  SELECT policies (public OR participant); all writes use the service role and are
  unaffected. **Run `supabase/migrations/0012_debate_read_rls.sql`** (safe to re-run).
- ℹ️ Audited the AI layer, Elo math, rate limiting, moderation, matchmaking, challenge
  accept, reports/blocks, and voting/reactions — no further bugs; concurrency guards
  and fail-open behaviour are sound.
- ✅ (Build) Earlier fix: `app/api/votes/route.ts` implicit-any index resolved (!8).

#### Earlier this session
- ✅ **Daily Topic leaderboard (Phase 3 item 5).** `/daily` ranks players who completed a
  debate on today's topic (total score, debates, wins), cached via `getDailyLeaderboard`
  (120s, tag `daily-leaderboard`, invalidated on completion). Linked from the Daily Topic
  banner. No migration.

#### Earlier this session
- ✅ **Audience voting (Phase 3 item 2).** `migration 0011` adds `spectator_votes`.
  `/api/votes` (GET tallies + own votes; POST toggle/switch) blocks participants; the
  `AudienceVote` widget shows a live Crowd split per round to spectators on
  active/scoring/completed debates. **Run `supabase/migrations/0011_spectator_votes.sql`.**

#### Earlier this session
- ✅ **Blitz mode (Phase 3 item 3).** `migration 0010` adds `debates.blitz`. Speed selector
  on the new-debate page; 90s client turn timer and a 120s auto-forfeit window for blitz
  (vs 11 min standard). **Run `supabase/migrations/0010_blitz_mode.sql`.** Caveat: blitz
  timeouts are bounded by the ~5-min GitHub Actions cron cadence (live play unaffected).

#### Earlier this session
- ✅ **Live spectator mode (Phase 3 item 1).** Non-participants view `/debate/[id]`
  read-only (gated by `isMyTurn` + server participant check). `SpectatorPresence` adds a
  live “N watching” count via a Realtime presence channel; a “Spectating” banner clarifies
  the score columns.

#### Earlier this session
- ✅ **Read-path caching + pooling (Phase 2 items 2-3).** Leaderboard page-1 served from
  `unstable_cache` (60s, tag `leaderboard`, invalidated on ranked Elo settle). Pooling is
  N/A at runtime (PostgREST is pre-pooled); use the Supavisor string for `SUPABASE_DB_URL`
  in drizzle-kit only. RLS enabled (no policies) on `scoring_jobs`.

#### Earlier this session
- ✅ **Async scoring queue (Phase 2 item 1).** `migration 0009` adds `scoring_jobs` +
  `enqueue_scoring_job` / `claim_scoring_jobs` (FOR UPDATE SKIP LOCKED) / `complete_scoring_job`.
  The argument + oracle-turn routes now enqueue and fire `/api/score` without awaiting, so
  submit returns immediately. The maintenance cron drains the queue; the score route clears
  the job on a terminal state. **Run `supabase/migrations/0009_scoring_jobs.sql` in Supabase.**

#### Earlier this session
- ✅ **Rate limiting + anti-Sybil (Phase 1 items 5-6).** `lib/rateLimit.ts` (wraps
  `check_rate_limit`, 0008) throttles `/api/matchmaking` (30/60s) and `/api/score`
  (60/60s, direct callers only). `lib/safety/fingerprint.ts` records a hashed signup IP
  and flags same-IP debates via `flag_sybil_debate` (0008) on match + challenge accept.
  **Phase 1 FREE track complete.**

#### Earlier this session
- ✅ **Safety: Gemini moderation pass + report/block.** `moderateWithOracle()` in
  `lib/ai/judge.ts` (+ `buildModerationPrompt`) gates every human argument; `/api/reports`
  and `/api/blocks` on the `0007` tables, with `ReportButton` (opponent arguments) and
  `BlockButton` (profiles). Matchmaking block-exclusion was already live via `0007`.
  Feed-level block hiding is deferred (needs the feed view to expose player ids).

#### Earlier this session
- ✅ **vs Oracle AI mode** — debate Gemini when no human is available. New
  `lib/ai/oracle.ts` (`argueAsOracle`, `ORACLE_USER_ID`), `buildOraclePrompt`
  in `prompts.ts`, `/api/debates/[id]/oracle-turn`, create-route
  `opponentType:'ai'` support (capped 3/day via `oracle_debates_today`),
  argument-route trigger, maintenance-cron Oracle backstop + forfeit skip, and
  the Opponent toggle on the new-debate page.
- ℹ️ Migrations `0006`–`0008` are applied and safe (idempotent). `0006` is now
  consumed by vs-Oracle mode. `0007`/`0008` app wiring is the next FREE work.

### Next FREE roadmap work (in order)
1. ✅ Gemini safety-pass moderation + report/block UI on `reports`/`user_blocks` (0007).
2. ✅ Rate-limit `/api/score` + `/api/matchmaking` via `check_rate_limit()` (0008).
3. ✅ Anti-Sybil flagging on match/accept (0008).
4. ✅ Async scoring via a Postgres `scoring_jobs` queue (0009).
5. ✅ Leaderboard read-path caching + pooling note (Phase 2 items 2-3).
6. ✅ Live spectator mode (Phase 3 item 1).
7. ✅ Blitz mode (Phase 3 item 3).
8. ✅ Audience voting (Phase 3 item 2).
9. ✅ Per-topic Daily Topic leaderboard (Phase 3 item 5).
10. **NEXT — Phase 3:** achievements/titles/badges, then debate replay.
11. Follow-ups: ✅ “Live now” discovery surface (`/live`); anonymous spectating; cached public-feed first page; hide blocked users from the feed.

---

#### Prior session (archived)

**Session:** Phase 8 — Phase 1 + Phase 2 features built
**Date:** 2026-06-13

### What was built this session (7 MRs, all open, awaiting merge)

1. **!1** — Public debate feed (`/debates`), score API security fix (participant check)
2. **!2** — Open challenges lobby (`/challenges`), X/Twitter share button, nav links (DEBATES, LOBBY)
3. **!3** — Auto-forfeit cron, server-anchored `turn_started_at`, `lib/debates/finalize.ts`
4. **!4** — Turn email notifications via Resend (`lib/email/resend.ts`, `/api/notify-turn`)
5. **!5** — Ranked matchmaking queue (`lib/matchmaking.ts`, `/api/matchmaking`, `MatchmakingButton`)
6. **!6** — Daily Topic cron + `DailyTopicBanner` on dashboard, `?topic=` prefill on new-debate page
7. **!7** — Argument reactions (`/api/reactions`, `ArgumentReactions` component)

### Immediate next steps for a new session

1. **Merge !1 → !2 → !3 → !4 → !5 → !6 → !7 in order** (all mergeable, no conflicts)
2. **Run migration SQL** (Section 5) on Supabase
3. **Set env vars:** `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
4. **Enable Realtime** on `matchmaking_queue` table in Supabase dashboard
5. **Seed today's daily topic** via the curl command in Section 14

### Next features to build (in priority order)
- **Debate titles/badges (#9)** — computed from `elo_rating` + debate counts, shown on profile
- **Debate replay (#10)** — `/debate/[id]/replay`, timeline view, scroll-animate scores
- **DB indexes** — run the CREATE INDEX statements from Section 5
- **DebateRoom.tsx refactor** — split into hooks + sub-components
- **Optimistic argument submission** — show immediately with `scoring_status: pending`

Document version: 4.1
AI provider: Google Gemini (real model, confirmed working; isolated in lib/ai/)
Infrastructure: 100% free tier (no budget) — limited cron (2 daily Vercel + best-effort 5-min GitHub Actions)
State: ALL features merged, ALL migrations (0002–0013) applied
Deployed: argos-indol.vercel.app
