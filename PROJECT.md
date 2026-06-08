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
- Framework: Next.js 14 (App Router) — free
- Styling: Tailwind CSS — free
- Components: shadcn/ui — free, open source
- State: Zustand — free

### Backend
- API layer: Next.js API Routes (serverless functions on Vercel)
- AI judge: Google Gemini via @google/generative-ai — free tier
- Async scoring: Supabase Edge Functions — free (500k invocations/month)
- Rate limiting: Simple DB counter to start; Upstash Redis free tier when needed

### Database & Auth
- Database: Supabase free tier (500MB, 50k rows)
- ORM: Drizzle ORM
- Auth: Supabase Auth (Google OAuth + email/password)
- Real-time: Supabase Realtime (free tier: 200 concurrent connections)

### Infrastructure cost table

| Service       | Free allowance                        | Upgrade trigger                         |
|---------------|---------------------------------------|-----------------------------------------|
| Vercel        | Unlimited deploys, 100GB bandwidth    | Custom domain needs Pro ($20/mo)        |
| Supabase      | 500MB DB, 50k rows, 2GB transfer      | DB > 500MB, Pro ($25/mo), ~month 2+    |
| Gemini API    | ~1,000 req/day Flash, no credit card  | Consistent limit hits -> paid or Claude |
| Upstash Redis | 10k req/day                           | $0.20/100k req when needed              |
| Resend        | 3,000 emails/month                    | Paid ($20/mo) for higher volume         |
| Sentry        | 5,000 errors/month                    | Free for a long time                    |
| Posthog       | 1M events/month                       | Free for a long time                    |

### Bootstrap commands
```bash
npx create-next-app@latest argos --typescript --tailwind --app
cd argos
npm install @supabase/supabase-js drizzle-orm @google/generative-ai resend
npm install -D drizzle-kit
```

### .env.local (NEVER commit — add to .gitignore immediately)
```bash
# AI — current provider (swap this block when switching to Anthropic)
GEMINI_API_KEY=your_key_from_aistudio.google.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email
RESEND_API_KEY=your_key_from_resend.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

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

### Row Level Security (enable on ALL tables)

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_all" ON users FOR SELECT USING (true);
CREATE POLICY "users_self_update" ON users FOR UPDATE USING (auth.uid() = id);

ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debates_participants_read" ON debates FOR SELECT
  USING (auth.uid() = player_a_id OR auth.uid() = player_b_id);
CREATE POLICY "debates_insert" ON debates FOR INSERT WITH CHECK (auth.uid() = player_a_id);

ALTER TABLE arguments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arguments_participants_read" ON arguments FOR SELECT
  USING (debate_id IN (
    SELECT id FROM debates WHERE player_a_id = auth.uid() OR player_b_id = auth.uid()
  ));
CREATE POLICY "arguments_insert" ON arguments FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "elo_read_all" ON elo_history FOR SELECT USING (true);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges_read_all" ON challenges FOR SELECT USING (true);
CREATE POLICY "challenges_insert" ON challenges FOR INSERT WITH CHECK (auth.uid() = creator_id);
```

---

## 8. Repo Structure

```
argos/
├── app/
│   ├── api/
│   │   ├── score/route.ts           # POST: save argument, invoke Edge Function
│   │   ├── debates/route.ts         # GET (list), POST (create)
│   │   ├── debates/[id]/route.ts    # GET (state), PATCH (join, update turn)
│   │   └── og/route.tsx             # GET: generate shareable PNG result card
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── debate/[id]/page.tsx         # Main debate room with Realtime
│   ├── profile/[id]/page.tsx        # Player profile, Elo chart, past debates
│   ├── challenges/page.tsx          # Public challenge board
│   ├── leaderboard/page.tsx         # Global Elo rankings
│   └── page.tsx                     # Landing page
├── lib/
│   ├── ai/
│   │   ├── judge.ts                 # ONLY file that imports Gemini/Anthropic SDK
│   │   ├── opponent.ts              # AI opponent for vs_ai mode
│   │   └── prompts.ts               # Prompt template functions
│   ├── db/
│   │   ├── schema.ts                # Drizzle schema
│   │   └── queries.ts               # Typed query helpers
│   ├── elo.ts                       # Pure calculateElo() function
│   └── supabase/
│       ├── client.ts                # Browser Supabase client
│       └── server.ts                # Server Supabase client
├── components/
│   ├── debate/
│   │   ├── ArgumentInput.tsx        # Textarea + word count + timer + submit
│   │   ├── ScoreBreakdown.tsx       # Per-dimension score bars
│   │   └── FallacyList.tsx          # Detected fallacies with explanations
│   ├── profile/
│   │   └── EloChart.tsx             # Elo over time (recharts)
│   └── ui/                          # shadcn/ui components
├── supabase/
│   ├── functions/
│   │   └── score-argument/          # Edge Function: calls Gemini, writes score
│   └── migrations/                  # SQL migration files
├── .env.local                       # NEVER COMMIT
├── .gitignore
└── PROJECT.md                       # This file
```

---

## 9. Async Scoring Architecture (Supabase Edge Functions)

```
User submits argument
  -> POST /api/score
  -> INSERT argument row (scoring_status: 'pending')
  -> supabase.functions.invoke('score-argument', { body: { argument_id } })
  -> Return { status: "scoring" } immediately — do not await the function
  -> Client shows "AI is scoring..." UI state

Edge Function fires (supabase/functions/score-argument/index.ts)
  -> SELECT argument + debate context from DB
  -> Call Gemini API with judge prompt
  -> Parse JSON (strip markdown fences if present)
  -> UPDATE arguments SET score_*, fallacies_found, ai_feedback, scoring_status = 'done'
  -> Supabase Realtime broadcasts row change to all subscribed clients automatically
  -> Client subscription fires -> renders full score breakdown
  -> On Gemini 429: wait 60s, retry once, set scoring_status = 'failed' if still failing
```

---

## 10. Elo Implementation

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

## 11. Shareable Result Card

Generated at /app/api/og/route.tsx using Next.js built-in OG Image API (no extra libraries).
Returns a PNG used as the Open Graph preview when debate result URLs are shared on social media.

Card shows: app name, topic, both usernames, final scores, winner + Elo change, top fallacy caught.
This is the primary viral growth mechanic.

---

## 12. Feature Roadmap

### MVP — weeks 1-3 (build ONLY this first)
- [ ] User auth (Google OAuth + email via Supabase Auth)
- [ ] Create debate + join via invite link
- [ ] Turn-based argument submission with countdown timer
- [ ] AI scoring per turn with per-dimension breakdown (Gemini Flash)
- [ ] Basic Elo rating
- [ ] Shareable result card (Next.js OG image)
- [ ] vs AI mode (Gemini plays the opposing side)

### V2 — weeks 4-8 (after real users give feedback)
- [ ] Daily Topic with global leaderboard
- [ ] Public challenge board
- [ ] Debate history + personal stats page
- [ ] Fallacy library (educational page + good for SEO)
- [ ] Email "it's your turn" notifications via Resend
- [ ] Spectator mode

### V3 — growth & monetisation
- [ ] Clubs / debate teams
- [ ] Tournaments with brackets
- [ ] Pro tier via Stripe ($8-12/month)
- [ ] Switch AI to Claude Haiku for higher quality (edit only /lib/ai/judge.ts)

---

## 13. Cost Projection

At launch: $0/month. All free tiers.

Gemini free headroom: ~1,000 Flash req/day = ~83 full debates/day = fine for early launch.

| Upgrade trigger                         | Service        | Cost      |
|-----------------------------------------|----------------|-----------|
| Gemini free limit consistently hit      | Gemini paid or Claude Haiku | ~$5-15/mo |
| DB exceeds 500MB                        | Supabase Pro   | $25/mo    |
| Custom domain needed                    | Vercel Pro     | $20/mo    |
| Email volume > 3k/month                 | Resend paid    | $20/mo    |

Break-even: 3-4 Pro subscribers at $8/month covers everything at 500 DAU.

---

## 14. Security Checklist (complete before public launch)

- [ ] .env.local confirmed in .gitignore before first commit
- [ ] GEMINI_API_KEY only in server-side files — never NEXT_PUBLIC_
- [ ] SUPABASE_SERVICE_ROLE_KEY only in server-side API routes — never client-side
- [ ] RLS enabled and tested on ALL Supabase tables
- [ ] Rate limiting on /api/score: max 1 scoring call per argument_id
- [ ] Basic profanity/abuse filter before argument reaches Gemini
- [ ] Gemini 429 handling in Edge Function with retry + graceful failure
- [ ] Sentry installed before public launch
- [ ] Posthog installed for analytics
- [ ] Full debate flow tested on Vercel preview URL before merging to main

---

## 15. Launch Strategy

Week 3 — Private alpha: 10-20 friends only. Watch them use it. Fix confusion before going public.

Week 4 — Public beta:
- Post on r/changemyview, r/slatestarcodex, r/philosophy, r/SideProject
- Hacker News Show HN: "I built chess.com for debate with an AI fallacy detector"
- Twitter/X: screen recording of AI catching a fallacy mid-debate

Week 5 — Community seeding:
- DM 5-10 university debate clubs, offer free access
- Post an interesting scored debate result as a full thread

Week 6 — Retention:
- Launch Daily Topic
- Add email "your turn" notifications
- Check Posthog funnel, fix top drop-off point

---

## 16. LLM Development Workflow

Starting any new chat:
1. Open this file
2. Paste ENTIRE contents as first message
3. Add: "I want to work on: [task from section 17]"

Ending a session:
Ask: "Summarise what we built today and the exact next task. Format it for my PROJECT.md section 17."

Best tool per task:
- Architecture + hard debugging: Claude (claude.ai)
- Writing/editing files in codebase: Claude Code CLI or Cursor IDE
- Generating UI visually: v0.dev (free, by Vercel)
- Gemini SDK questions: Gemini itself
- Fallback when Claude quota runs out: ChatGPT or Gemini — paste PROJECT.md same way

---

## 17. Current Status

Current phase: Phase 4 — Elo + score breakdown + polish

### Phase checklist
- [x] Phase 0: Setup (GitHub, Vercel, Supabase, Gemini API key, .env.local, PROJECT.md in repo)
- [x] Phase 1: Database + auth (schema applied, RLS on, Google OAuth working, Drizzle configured)
- [x] Phase 2: Core game loop (create debate, debate room UI, argument submission, two-player flow)
- [x] Phase 3: AI judge (Gemini integration, real-time scoring, correct completion timing)
- [ ] Phase 4: Elo + score breakdown + polish
- [ ] Phase 5: Security + public launch
- [ ] Phase 6: Growth features

### Last session
Built and tested the full debate flow end to end:
- Google OAuth login working with auto user creation trigger
- Debate creation, invite link, two-player join flow
- Turn-based argument submission with countdown timer
- Gemini AI scoring working in real time (66 vs 59 in test debate)
- Realtime updates via Supabase — no manual refresh needed
- Debate completes only after all arguments are scored
- Fixed RLS policies for topics, debates, arguments tables

### Known issues / active blockers
- Score breakdown UI (bars + fallacy list) not showing during the debate yet
- Manual refresh still needed in some edge cases (opponent turn notification)
- Elo ratings not updating after debate completion

### Next immediate task
Phase 4 — in this order:
1. Verify ScoreBreakdown component shows during debate (check why bars not appearing mid-debate)
2. Implement Elo update after debate completes in score/route.ts
3. Build shareable result card via Next.js OG image API
---
### Last session
- Score breakdown bars + fallacy detection showing during debate in real time
- Arguments persist after debate completes (not replaced by results)
- "AI is scoring final arguments..." banner during last round
- Elo updates implemented for ranked debates
- Win/loss counts updating for casual debates  
- Switched Gemini model to gemini-3.1-flash-lite (500 RPD free vs 20 RPD on 2.5 Flash)
- Added 429 rate limit to retry logic alongside 503

### Known issues / active blockers
- Opponent Round 1 argument not getting scored in some cases (need to verify with new model)
- Need to test full ranked debate Elo change end to end

### Next immediate task
Test a full ranked debate with both accounts and verify:
1. All arguments get scored including opponent round 1
2. Elo ratings change on dashboard after ranked debate completes
3. Win/loss counts update
Then move to: shareable result card (OG image)

### Last session
Fixed stuck turn bug — fetch fresh debate state before updating turn.
All core game loop working: scoring, fallacy detection, Elo updates, completion flow.

### Next immediate task
Build shareable result card at /app/api/og/route.tsx using Next.js OG Image API.
Shows: topic, both players, final scores, winner, Elo change, top fallacy caught.

### Last session
Phase 4 complete:
- Shareable OG result card working on Vercel (topic, scores, winner, usernames)
- Landing page live at argos-indol.vercel.app
- Share button on completed debate screen
- Fixed invalid hex CSS bug in OG route

### Next immediate task
Phase 5 — Security + public launch prep:
1. Add content moderation filter before arguments reach Gemini
2. Add rate limiting on /api/score (prevent abuse)
3. Install Sentry for error monitoring
4. Install Posthog for analytics
5. Test full flow on Vercel with a real friend

### Last session
Phase 5 complete. Full production test passed on argos-indol.vercel.app.
All systems working: AI scoring, fallacy detection, real-time updates,
share card, result screen, security checklist complete.

### Next immediate task
Phase 6 — Public launch:
1. Post on r/changemyview, r/slatestarcodex, r/SideProject
2. Post Show HN on Hacker News
3. Tweet demo showing AI catching a fallacy
4. Share with friend for real two-player test



Document version: 2.0
AI provider: Google Gemini free tier
Infrastructure: 100% free at launch
Provider-swap architecture: edit only /lib/ai/judge.ts and /lib/ai/opponent.ts to switch to Claude