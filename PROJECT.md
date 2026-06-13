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
│   │   │   ├── route.ts                  # POST: create debate
│   │   │   └── [id]/route.ts             # GET: state, PATCH: join/update turn
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
│   │   ├── judge.ts                      # ONLY file importing Gemini SDK
│   │   └── prompts.ts                    # Judge prompt template
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

Document version: 4.0
AI provider: Google Gemini (`gemini-3.1-flash-lite`)
Infrastructure: 100% free at launch
Deployed: argos-indol.vercel.app
