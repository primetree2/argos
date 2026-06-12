# PROJECT: Argos — AI Debate Arena
> Single source of truth for the Argos project.
> Paste this entire file at the start of ANY new LLM chat to restore full context instantly.
> Only the section `## 17. Current Status` needs updating after each session.
> Everything above is stable reference — do not edit unless the plan fundamentally changes.

---

## 1. Concept

A turn-based online debate platform where two players argue opposing sides of a topic in timed
rounds. After each argument, an AI judge (Gemini) scores it on argumentation quality — not on
whether the position is correct. Players earn an Elo rating like chess.com.

**Tagline:** Chess.com for debate.

**Core differentiator:** The AI judge detects cognitive biases and logical fallacies (straw man,
ad hominem, appeal to authority, etc.) and deducts points with named, explained penalties. This
scoring breakdown is the shareable, viral element of the product.

---

## 2. AI Provider Strategy

### Current: Google Gemini (free tier via Google AI Studio)
- **Provider:** Google AI Studio — aistudio.google.com
- **Model for scoring:** `gemini-2.5-flash` — free, fast, great at structured JSON output
- **Model for vs-AI mode:** `gemini-2.5-pro` — better reasoning (use sparingly, lower free quota)
- **SDK:** `@google/generative-ai` (official Google Node.js SDK)
- **Free limits:** ~1,000 req/day for Flash, no credit card required, no expiry
- **Key env var:** `GEMINI_API_KEY` — server-side only, NEVER in any NEXT_PUBLIC_ variable

### Future upgrade path: Anthropic Claude (when budget allows)
The entire AI layer is isolated in two files: `/lib/ai/judge.ts` and `/lib/ai/opponent.ts`.
To switch providers, ONLY these two files change. Zero other code touches the AI provider.

```
Current:  GEMINI_API_KEY     -> /lib/ai/judge.ts  -> scoring API route
Future:   ANTHROPIC_API_KEY  -> /lib/ai/judge.ts  -> scoring API route (same exported interface)
```

Recommended future models when switching:
- Scoring: `claude-haiku-4-5-20251001` — ~10x cheaper than Sonnet, better quality than Flash
- vs-AI opponent: `claude-sonnet-4-6` — better conversational reasoning

### Free tier capacity math
- Flash: ~1,000 req/day = ~500 arguments scored = ~83 full 3-round debates/day
- Sufficient for: all development, alpha, early beta (under ~100 DAU)
- Upgrade trigger: when free limit is consistently hit OR first paying users arrive

---

## 3. Debate Game Loop

```
Match created
  -> Topic revealed + sides assigned (FOR / AGAINST)
  -> Player A writes opening argument (timer: 5-15 min, configured pre-match)
  -> AI scores argument async (non-blocking, returns JSON breakdown)
  -> Player B writes rebuttal (sees Player A's full argument)
  -> AI scores rebuttal
  -> [Repeat for 3-5 rounds, configurable per match]
  -> AI issues final verdict + full scorecard
  -> Elo ratings updated for both players
  -> Shareable result card generated (OG image)
```

---

## 4. Debate Modes

| Mode          | Description                                                             |
|---------------|-------------------------------------------------------------------------|
| ranked        | Elo-rated, matched by skill level                                       |
| casual        | Unranked, invite a friend or match randomly                             |
| challenge     | Post a public challenge on a topic; anyone can accept                   |
| daily_topic   | One AI-curated topic per day; global leaderboard for that day           |
| vs_ai         | Debate Gemini directly — day-one retention hook when queue is empty     |

---

## 5. AI Judge — Scoring System

The judge scores each argument independently across 5 dimensions.
It evaluates argumentation quality ONLY — never whether the position is factually correct.

### Scoring dimensions (max 80 points per argument)

| Dimension         | Max pts  | What is measured                                                        |
|-------------------|----------|-------------------------------------------------------------------------|
| Claim clarity     | 20       | Is the position explicitly stated? Is the thesis unambiguous?           |
| Evidence quality  | 20       | Peer-reviewed > primary > news > anecdote. Outdated sources penalised.  |
| Logical validity  | 20       | Does conclusion follow from premises? Contradictions deducted.          |
| Rebuttal strength | 20       | Did you address the opponent's specific points?                         |
| Fallacy penalty   | -1 to -15| Subtracted from total. Each fallacy named, quoted, and explained.       |

### Fallacies detected
Ad hominem, Straw man, False dichotomy, Appeal to authority, Slippery slope,
Cherry picking, Circular reasoning, Anecdotal evidence as proof, Bandwagon, Moving goalposts

### AI judge system prompt (lives in /lib/ai/prompts.ts)

```
You are a neutral, Socratic debate judge. You hold no opinions on any topic.
You evaluate ONLY the quality of argumentation — never whether the position is correct.
A perfectly argued flat-earth position should outscore a sloppily argued heliocentric one.

Respond ONLY with valid JSON. No preamble, no markdown fences, no text outside the JSON object.

Required JSON schema:
{
  "clarity": <integer 0-20>,
  "evidence": <integer 0-20>,
  "logic": <integer 0-20>,
  "rebuttal": <integer 0-20>,
  "fallacy_penalty": <integer, 0 or negative>,
  "fallacies_found": [
    {
      "name": "<fallacy name>",
      "quote": "<exact offending phrase from the argument>",
      "explanation": "<one sentence: why this is a fallacy>"
    }
  ],
  "feedback": "<2-3 sentence specific coaching note — not generic>",
  "total": <clarity + evidence + logic + rebuttal + fallacy_penalty>
}

Topic: {TOPIC}
This player's assigned position: {SIDE}
Opponent's previous argument: {PREV_ARGUMENT}
Argument to score: {CURRENT_ARGUMENT}
```

### AI abstraction layer — the provider-swap pattern

```typescript
// /lib/ai/judge.ts
// THE ONLY FILE THAT IMPORTS GEMINI (or future Anthropic)
// To switch to Anthropic: rewrite only this file. Exported interface never changes.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildJudgePrompt } from "./prompts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface ScoreResult {
  clarity: number;
  evidence: number;
  logic: number;
  rebuttal: number;
  fallacy_penalty: number;
  fallacies_found: { name: string; quote: string; explanation: string }[];
  feedback: string;
  total: number;
}

export async function scoreArgument(
  topic: string,
  side: "FOR" | "AGAINST",
  currentArgument: string,
  prevArgument: string | null
): Promise<ScoreResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = buildJudgePrompt(topic, side, currentArgument, prevArgument);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as ScoreResult;
}
```

---

## 6. Tech Stack — Free-First, Upgrade-Ready

### Frontend
- Framework: Next.js 15 (App Router) — free
- Styling: Tailwind CSS v4 — free
- Components: shadcn/ui — free, open source
- Fonts: Cinzel, Cinzel Decorative, Crimson Pro, Share Tech Mono (Google Fonts via next/font)

### Backend
- API layer: Next.js API Routes (serverless functions on Vercel)
- AI judge: Google Gemini via @google/generative-ai — free tier
- Rate limiting: Simple DB counter to start; Upstash Redis free tier when needed

### Database & Auth
- Database: Supabase free tier (500MB, 50k rows)
- ORM: Drizzle ORM
- Auth: Supabase Auth (Google OAuth)
- Real-time: Supabase Realtime (free tier: 200 concurrent connections)

### Observability
- Error monitoring: Sentry
- Analytics: Posthog

### Infrastructure cost table

| Service       | Free allowance                        | Upgrade trigger                         |
|---------------|---------------------------------------|-----------------------------------------|
| Vercel        | Unlimited deploys, 100GB bandwidth    | Custom domain needs Pro ($20/mo)        |
| Supabase      | 500MB DB, 50k rows, 2GB transfer      | DB > 500MB, Pro ($25/mo)               |
| Gemini API    | ~1,000 req/day Flash, no credit card  | Consistent limit hits -> paid or Claude |
| Upstash Redis | 10k req/day                           | $0.20/100k req when needed              |
| Resend        | 3,000 emails/month                    | Paid ($20/mo) for higher volume         |
| Sentry        | 5,000 errors/month                    | Free for a long time                    |
| Posthog       | 1M events/month                       | Free for a long time                    |

---

## 7. Database Schema

```sql
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
  source    TEXT DEFAULT 'user'
);

CREATE TABLE debates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id       UUID REFERENCES topics(id),
  player_a_id    UUID REFERENCES users(id),
  player_b_id    UUID REFERENCES users(id),
  player_a_side  TEXT NOT NULL,
  mode           TEXT NOT NULL,
  status         TEXT DEFAULT 'waiting',
  current_turn   UUID REFERENCES users(id),
  total_rounds   INTEGER DEFAULT 3,
  current_round  INTEGER DEFAULT 1,
  winner_id      UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
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
  scoring_status  TEXT DEFAULT 'pending'
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
  status      TEXT DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. Repo Structure

```
argos/
├── app/
│   ├── api/
│   │   ├── score/route.ts           # POST: save argument, invoke Gemini scoring
│   │   ├── debates/route.ts         # GET (list), POST (create)
│   │   ├── debates/[id]/route.ts    # GET (state), PATCH (join, update turn)
│   │   └── og/route.tsx             # GET: generate shareable PNG result card
│   ├── auth/
│   │   ├── callback/route.ts        # Supabase OAuth callback
│   │   ├── error/page.tsx           # Auth error display
│   │   └── signout/route.ts         # Sign-out handler
│   ├── dashboard/page.tsx           # Player stats: Elo, W/L, action cards
│   ├── debate/
│   │   ├── new/page.tsx             # Debate setup: topic, mode, rounds
│   │   └── [id]/page.tsx            # Debate room hydration
│   ├── login/page.tsx               # Google OAuth sign-in
│   ├── globals.css                  # Oracle Terminal design system
│   ├── layout.tsx                   # Root layout: fonts, ThemeProvider
│   └── page.tsx                     # Landing page
├── components/
│   ├── auth/
│   │   └── LoginButton.tsx          # Google OAuth trigger button
│   ├── debate/
│   │   ├── DebateRoom.tsx           # Main debate room: Realtime, timer, state machine
│   │   └── ScoreBreakdown.tsx       # Animated score bars + fallacy cards
│   ├── ui/
│   │   └── ThemeToggle.tsx          # Fixed dark/light theme toggle button
│   ├── CircuitBackground.tsx        # Animated SVG circuit traces background
│   ├── DashboardClient.tsx          # Client component: count-up stats, liquid win rate
│   ├── Navbar.tsx                   # Global navbar with JOIN debate bar
│   ├── PosthogProvider.tsx          # Analytics wrapper
│   └── ThemeProvider.tsx            # Theme context: dark/light, localStorage persist
├── lib/
│   ├── ai/
│   │   ├── judge.ts                 # ONLY file that imports Gemini SDK
│   │   └── prompts.ts               # Prompt template functions
│   ├── db/
│   │   └── schema.ts                # Drizzle schema
│   ├── elo.ts                       # Pure calculateElo() function
│   └── supabase/
│       ├── client.ts                # Browser Supabase client
│       └── server.ts                # Server Supabase client
└── PROJECT.md                       # This file
```

---

## 9. Elo Implementation

```typescript
// /lib/elo.ts
export function calculateElo(
  winnerElo: number,
  loserElo: number,
  kFactor: number = 32
): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser  = 1 - expectedWinner;
  return {
    newWinnerElo: Math.round(winnerElo + kFactor * (1 - expectedWinner)),
    newLoserElo:  Math.round(loserElo  + kFactor * (0 - expectedLoser)),
  };
}
// K=32 for players with <30 debates, K=16 for 30+ debates. Starting Elo: 1200.
```

---

## 10. Shareable Result Card

Generated at /app/api/og/route.tsx using Next.js built-in OG Image API.
Returns a PNG used as the Open Graph preview when debate result URLs are shared on social media.
Card shows: app name, topic, both usernames, final scores, winner + Elo change, top fallacy caught.
This is the primary viral growth mechanic.

---

## 11. UI Design System — Oracle Terminal

Argos uses a custom design system called **Oracle Terminal**:
"An ancient debate institution that gained sentience. Gold leaf meets circuit boards."

### Aesthetic
Dark mode default: near-black void (`#07080a`) with burnished gold (`#c9a84c`) as primary accent
and neon teal (`#00ffe0`) as the tech accent. Light mode uses aged parchment (`#f0ead8`) tones.
Atmospheric background: SVG noise texture + radial gold/teal gradients + animated circuit traces.

### Font Stack
| Variable             | Font                  | Usage                              |
|----------------------|-----------------------|------------------------------------|
| `--font-cinzel`      | Cinzel                | Headings, labels, UI chrome        |
| `--font-cinzel-deco` | Cinzel Decorative     | ARGOS wordmark, hero title         |
| `--font-crimson`     | Crimson Pro           | Body text, argument content        |
| `--font-share-tech`  | Share Tech Mono       | Scores, data readouts, monospace   |

### Key CSS classes (globals.css)
- `.glass-card` — liquid glass effect: `backdrop-filter: blur(16px)`, gold border, shadow
- `.btn-oracle` — primary CTA: gold fill, Cinzel label, hover lift + glow
- `.btn-ghost` — secondary: transparent, gold border on hover
- `.oracle-input` — form fields: dark glass, gold focus ring glow
- `.gold-rule` / `.gold-rule-subtle` — decorative horizontal dividers
- `.label-oracle` — small caps Cinzel labels, gold, wide letter-spacing
- `.scanlines` — subtle CRT scanline overlay for instrument panels
- `.text-shimmer` — animated gold shimmer sweep (used on hero ARGOS title)
- `.reveal-1` through `.reveal-6` — staggered page-load fade-up animations
- `.cursor-blink` — blinking pipe cursor appended via `::after`
- `.badge-for` / `.badge-against` — gold/teal side indicator pills

### Theme system
Two themes controlled via `data-theme` attribute on `<html>`:
- Dark (default): no attribute
- Light: `data-theme="light"`

Toggled by `ThemeProvider` + `ThemeToggle` components. Persisted to `localStorage`.
Anti-flash inline script in layout.tsx reads localStorage before first paint.

### CircuitBackground component
Fixed SVG behind all page content. Contains:
- Gold traces (~80%): right-angle clusters at corners, vertical spines on each side
- Teal traces (~20%): horizontal band top-centre, mid-side branches, bottom accent
- Intersection node dots in matching colors
- 5 animated pulse dots (3 gold, 2 teal) via SVG `animateMotion`
- Radial vignette overlay darkening edges, spotlighting centre content
- `intensity` prop: `1.0` (landing/login/dashboard), `0.7` (new debate), `0.45` (debate room)
- Light mode: SVG at 35% opacity, warm amber vignette

### Dashboard special features
- `DashboardClient.tsx` — client component for animated stats
- Count-up animation on all 4 stats (Elo, Won, Lost, Win Rate) on page load
- Win Rate panel: full-card teal liquid fill rising to win%, wave animation on surface
  - Text contrast adapts: teal on dark background → near-black when liquid covers text
- New Debate card: `breathe-gold` CSS animation — slow box-shadow pulse draws the eye
- Breathing glow pauses on hover, replaced by full gold lift

### Pages summary
| Page              | Key design features                                                  |
|-------------------|----------------------------------------------------------------------|
| Landing           | Staggered 6-beat reveal, gold shimmer ARGOS title, circuit grid bg   |
| Login             | Oracle Seal SVG emblem, glass card, Latin inscription footer         |
| Dashboard         | Instrument stat panels, liquid win rate, breathing New Debate card   |
| New Debate        | oracle-input textarea, word counter, mode cards (gold/teal), slider  |
| Debate Room       | Color-coded argument cards (gold=you, teal=opponent), score tribune  |
| Score Breakdown   | Animated 3px bars, fallacy red cards, "Oracle Speaks" feedback panel |
| Auth Error        | Red-triangle icon, glass card, Cinzel heading                        |

### Navbar
- Sticky, glass blur, Oracle triangle wordmark
- JOIN button expands a slide-down bar for pasting debate links or IDs
- Accepts full URL or bare debate ID
- `hideJoinBar` prop for debate room, `hideAuth` for landing/login

### Mobile responsiveness
Breakpoints handled via CSS classes in globals.css:
- `≤640px`: stat grid → 2 columns, Elo spans full width
- `≤500px`: action cards → 1 col, panels → 1 col, mode selector → 1 col
- `≤580px`: score tribune stacks vertically
- `≤480px`: result buttons stack full-width
- `≤520px`: join bar label wraps to own line

---

## 12. Feature Roadmap

### Complete ✓
- [x] User auth (Google OAuth via Supabase Auth)
- [x] Create debate + join via invite link
- [x] Turn-based argument submission with countdown timer
- [x] AI scoring per turn with per-dimension breakdown (Gemini Flash)
- [x] Fallacy detection (10 types, named + quoted + explained)
- [x] Elo rating (K=32/<30 debates, K=16/30+)
- [x] Shareable result card (Next.js OG image API)
- [x] Realtime updates (Supabase Realtime on debates + arguments tables)
- [x] Full UI renovation — Oracle Terminal design system
- [x] Dark/light theme with persistence
- [x] Animated circuit background
- [x] Liquid fill win rate, count-up stats, breathing glow CTA
- [x] Mobile responsive layout
- [x] Sentry error monitoring
- [x] Posthog analytics
- [x] Deployed at argos-indol.vercel.app

### Next — V2
- [ ] Leaderboard page (global Elo rankings)
- [ ] Debate history on dashboard (past debates list)
- [ ] Profile page (public stats, Elo chart, recent debates)
- [ ] Challenge system (invite specific opponent, uses existing challenges table)
- [ ] Debate vs AI (Gemini plays opposing side)
- [ ] Elo history sparkline chart (elo_history table already exists)
- [ ] loading.tsx spinners on each route
- [ ] Email "your turn" notifications via Resend

### V3 — Growth & monetisation
- [ ] Daily Topic with global leaderboard
- [ ] Clubs / debate teams
- [ ] Tournaments with brackets
- [ ] Pro tier via Stripe ($8-12/month)
- [ ] Switch AI to Claude Haiku (edit only /lib/ai/judge.ts)

---

## 13. Security Checklist

- [x] .env.local confirmed in .gitignore
- [x] GEMINI_API_KEY only in server-side files
- [x] SUPABASE_SERVICE_ROLE_KEY only in server-side API routes
- [x] RLS enabled and tested on ALL Supabase tables
- [x] Rate limiting on /api/score
- [x] Sentry installed
- [x] Posthog installed
- [x] Full debate flow tested on Vercel
- [ ] Basic profanity/abuse filter before argument reaches Gemini
- [ ] Gemini 429 handling with retry + graceful failure (partially done)

---

## 14. LLM Development Workflow

Starting any new chat:
1. Open this file
2. Paste ENTIRE contents as first message
3. Add: "I want to work on: [specific feature]"

Best tool per task:
- Architecture + hard debugging: Claude (claude.ai)
- Writing/editing files in codebase: Claude Code CLI or Cursor IDE
- Generating UI visually: v0.dev (free, by Vercel)
- Gemini SDK questions: Gemini itself

---

## 15. Current Status

Current phase: Phase 6 — Live, deployed, V2 features next

### Phase checklist
- [x] Phase 0: Setup (GitHub, Vercel, Supabase, Gemini API key, .env.local)
- [x] Phase 1: Database + auth
- [x] Phase 2: Core game loop
- [x] Phase 3: AI judge
- [x] Phase 4: Elo + score breakdown
- [x] Phase 5: Security + public launch prep
- [x] Phase 6: Oracle Terminal UI renovation + deployment
- [ ] Phase 7: V2 features (leaderboard, history, profile, challenges)

### Last session — Oracle Terminal UI Renovation
Complete frontend redesign across all pages. Files changed:

**New files:**
- `components/CircuitBackground.tsx` — animated SVG circuit traces with gold + teal, pulse dots, vignette, intensity prop
- `components/DashboardClient.tsx` — client component with count-up stats, liquid win rate panel, breathing glow CTA
- `components/ThemeProvider.tsx` — dark/light theme context with localStorage persistence
- `components/ui/ThemeToggle.tsx` — fixed bottom-right theme toggle button (sun/moon)
- `components/Navbar.tsx` — global navbar with Oracle wordmark + JOIN debate link bar

**Replaced files:**
- `app/globals.css` — full Oracle Terminal design system (tokens, animations, glass cards, responsive breakpoints)
- `app/layout.tsx` — Cinzel/Crimson Pro/Share Tech Mono fonts, ThemeProvider, anti-flash script
- `app/page.tsx` — staggered hero, shimmer title, instrument panels, "The Trial" cards
- `app/login/page.tsx` — Oracle Seal SVG, glass card, Latin inscription
- `app/dashboard/page.tsx` — now a thin server component, delegates to DashboardClient
- `app/debate/new/page.tsx` — oracle-input, mode cards, gold slider, word counter
- `components/debate/DebateRoom.tsx` — color-coded cards, score tribune, dramatic result screen
- `components/debate/ScoreBreakdown.tsx` — tiered animated bars, fallacy red cards, Oracle Speaks panel
- `components/auth/LoginButton.tsx` — Oracle-styled Google OAuth button
- `app/auth/error/page.tsx` — Oracle-styled error page

**Key fixes applied during session:**
- Removed `onMouseEnter`/`onMouseLeave` from server components (Next.js App Router constraint)
- Replaced `<script>` tag with `<Script strategy="beforeInteractive">` from next/script
- All hover effects on server-rendered pages moved to pure CSS classes
- Mobile responsive pass: CSS breakpoint classes wired to JSX elements

### Next immediate task
Phase 7 — V2 features, suggested order:
1. Leaderboard page (`app/leaderboard/page.tsx`) — query users table ordered by elo_rating
2. Debate history section on dashboard — query debates table for current user
3. Profile page (`app/profile/[username]/page.tsx`) — public stats + Elo sparkline

Document version: 3.0
AI provider: Google Gemini free tier
Infrastructure: 100% free at launch
Deployed: argos-indol.vercel.app