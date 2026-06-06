import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").unique().notNull(),
    email: text("email").unique().notNull(),
    eloRating: integer("elo_rating").default(1200),
    debatesWon: integer("debates_won").default(0),
    debatesLost: integer("debates_lost").default(0),
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
    createdAt: timestamp("created_at").defaultNow(),
});