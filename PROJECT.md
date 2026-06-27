# PROJECT: Argos — AI Debate Arena
> Single source of truth for the Argos project.
> Paste this entire file at the start of ANY new LLM chat to restore full context instantly.
> Only the section `## 15. Current Status` needs updating after each session.
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

### Phase 1 — Retention (COMPLETE, in review as MRs !1–!4)
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

- [x] `.env.local` in `.gitignore`
- [x] `GEMINI_API_KEY` server-side only
- [x] `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] RLS enabled on all Supabase tables
- [x] Sentry installed
- [x] Posthog installed
- [x] Moderation filter on argument submission (`lib/moderation.ts`)
- [x] Score API participant check (403 for non-participants) — added Phase 8
- [x] Cron routes protected by `CRON_SECRET` + `x-vercel-cron` header
- [x] Challenge accept: race guard prevents double-accept
- [x] Matchmaking: two-row atomic claim with rollback
- [ ] Rate limiting on debate creation (max 10/day free tier)
- [ ] Gemini 429 handling fully robust (partial — 3 retries in judge.ts)

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

> **GROUND TRUTH (read this first):** Everything described anywhere in this file
> is **MERGED to `main`**, and **all migrations `0002`–`0013` are APPLIED** in
> Supabase. Ignore any older "awaiting merge" / "run this migration" wording
> below — it is historical. The Gemini model in use is real and working.
>
> **Hard constraint:** no budget. Everything stays on **free tiers only**. Cron
> is limited — 2 daily Vercel crons (`daily-topic`, `maintenance`) plus a
> best-effort ~5-min GitHub Actions ping of `/api/cron/maintenance`. Do not add
> features that assume paid cron, paid Realtime, or any paid service.

**Session:** Phase 4 — presence-based Quick Match (FREE)
**Date:** 2026-06-27

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
11. Follow-ups: “Live now” discovery surface; anonymous spectating; cached public-feed first page; hide blocked users from the feed.

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
