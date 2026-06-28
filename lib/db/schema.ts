import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, date, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").unique().notNull(),
    email: text("email").unique().notNull(),
    eloRating: integer("elo_rating").default(1200),
    debatesWon: integer("debates_won").default(0),
    debatesLost: integer("debates_lost").default(0),
    // Player country (migration 0017): ISO 3166-1 alpha-2, best-effort from the
    // edge geo header at matchmaking time. Nullable — powers Quick Match flags.
    country: text("country"),
    // Phase 5 monetization plumbing (migration 0015). Inert during beta
    // (lib/billing/limits.ts BETA_UNLIMITED keeps everyone unlimited).
    isPro: boolean("is_pro").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

export const topics = pgTable("topics", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    category: text("category"),
    source: text("source").default("user"),
});

export const debates = pgTable("debates", {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").references(() => topics.id),
    playerAId: uuid("player_a_id").references(() => users.id),
    playerBId: uuid("player_b_id").references(() => users.id),
    playerASide: text("player_a_side").notNull(),
    mode: text("mode").notNull(),
    status: text("status").default("waiting"),
    currentTurn: uuid("current_turn").references(() => users.id),
    totalRounds: integer("total_rounds").default(3),
    currentRound: integer("current_round").default(1),
    winnerId: uuid("winner_id").references(() => users.id),
    isPublic: boolean("is_public").default(true),
    turnStartedAt: timestamp("turn_started_at", { withTimezone: true }),
    // Blitz mode (migration 0010): short 90s turns instead of 10 min.
    blitz: boolean("blitz").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

export const arguments_ = pgTable("arguments", {
    id: uuid("id").primaryKey().defaultRandom(),
    debateId: uuid("debate_id").references(() => debates.id),
    userId: uuid("user_id").references(() => users.id),
    roundNumber: integer("round_number").notNull(),
    content: text("content").notNull(),
    submittedAt: timestamp("submitted_at").defaultNow(),
    scoreTotal: integer("score_total"),
    scoreClarity: integer("score_clarity"),
    scoreEvidence: integer("score_evidence"),
    scoreLogic: integer("score_logic"),
    scoreRebuttal: integer("score_rebuttal"),
    fallacyPenalty: integer("fallacy_penalty").default(0),
    fallaciesFound: jsonb("fallacies_found").default([]),
    aiFeedback: text("ai_feedback"),
    scoringStatus: text("scoring_status").default("pending"),
});

export const eloHistory = pgTable("elo_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    debateId: uuid("debate_id").references(() => debates.id),
    eloBefore: integer("elo_before"),
    eloAfter: integer("elo_after"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const challenges = pgTable("challenges", {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id").references(() => users.id),
    topicId: uuid("topic_id").references(() => topics.id),
    status: text("status").default("open"),
    // Set when accepted so the creator's lobby can redirect to the new debate.
    debateId: uuid("debate_id").references(() => debates.id),
    createdAt: timestamp("created_at").defaultNow(),
});

export const matchmakingQueue = pgTable("matchmaking_queue", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).unique().notNull(),
    eloRating: integer("elo_rating").default(1200),
    status: text("status").default("waiting"),
    matchedDebateId: uuid("matched_debate_id").references(() => debates.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
});

export const dailyTopics = pgTable("daily_topics", {
    id: uuid("id").primaryKey().defaultRandom(),
    date: text("date").unique().notNull(), // YYYY-MM-DD (UTC)
    title: text("title").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const argumentReactions = pgTable("argument_reactions", {
    id: uuid("id").primaryKey().defaultRandom(),
    argumentId: uuid("argument_id").references(() => arguments_.id).notNull(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    reactionType: text("reaction_type").notNull(), // strong | brutal | questionable
    createdAt: timestamp("created_at").defaultNow(),
});

// Durable per-user / per-action / per-UTC-day usage counter (migration 0015).
// Backs metered free-tier limits without Redis; written via record_usage()
// and read via usage_today(). See lib/billing/limits.ts.
export const dailyUsage = pgTable("daily_usage", {
    userId: uuid("user_id").references(() => users.id).notNull(),
    action: text("action").notNull(), // debate_create | oracle_debate | ranked_match
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
}, (t) => ({
    pk: primaryKey({ columns: [t.userId, t.action, t.day] }),
}));

// Async scoring queue (migration 0009). One row per argument awaiting scoring;
// drained by the maintenance cron via claim_scoring_jobs().
export const scoringJobs = pgTable("scoring_jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    argumentId: uuid("argument_id").references(() => arguments_.id).unique().notNull(),
    userId: uuid("user_id").references(() => users.id),
    status: text("status").notNull().default("queued"), // queued | claimed
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});