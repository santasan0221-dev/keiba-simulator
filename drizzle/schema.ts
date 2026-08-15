import { double, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Server-side configuration and health state for the managed single_pick_ai sync. */
export const raceSyncSources = mysqlTable(
  "race_sync_sources",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceKey: varchar("sourceKey", { length: 96 }).notNull(),
    baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
    enabled: int("enabled").notNull().default(1),
    refreshMinutes: int("refreshMinutes").notNull().default(15),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastAttemptAt: timestamp("lastAttemptAt"),
    lastSuccessAt: timestamp("lastSuccessAt"),
    nextRetryAt: timestamp("nextRetryAt"),
    consecutiveFailures: int("consecutiveFailures").notNull().default(0),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("race_sync_sources_source_key_unique").on(table.sourceKey), index("race_sync_sources_cron_task_idx").on(table.scheduleCronTaskUid)]
);

/** Latest server-observed result per real race, including only API-supplied outcome metrics. */
export const raceSyncSnapshots = mysqlTable(
  "race_sync_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    raceKey: varchar("raceKey", { length: 255 }).notNull(),
    raceDate: varchar("raceDate", { length: 16 }),
    organization: varchar("organization", { length: 32 }),
    venue: varchar("venue", { length: 128 }),
    raceNo: int("raceNo"),
    raceStatus: varchar("raceStatus", { length: 48 }).notNull(),
    calibrationStatus: varchar("calibrationStatus", { length: 64 }).notNull(),
    asOf: varchar("asOf", { length: 64 }),
    resultStatus: varchar("resultStatus", { length: 48 }),
    aiPickFinish: int("aiPickFinish"),
    aiPickOutcome: varchar("aiPickOutcome", { length: 48 }),
    comparedCount: int("comparedCount"),
    exactMatches: int("exactMatches"),
    meanAbsoluteRankError: double("meanAbsoluteRankError"),
    winReturnRate: double("winReturnRate"),
    placeReturnRate: double("placeReturnRate"),
    payloadJson: text("payloadJson").notNull(),
    lastSyncedAt: timestamp("lastSyncedAt").defaultNow().notNull(),
    confirmedAt: timestamp("confirmedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("race_sync_snapshots_race_key_unique").on(table.raceKey), index("race_sync_snapshots_source_idx").on(table.sourceId), index("race_sync_snapshots_result_idx").on(table.resultStatus)]
);

/** Bounded operational history for background synchronization and visible error diagnosis. */
export const raceSyncRuns = mysqlTable(
  "race_sync_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    message: text("message"),
    racesChecked: int("racesChecked").notNull().default(0),
    racesUpdated: int("racesUpdated").notNull().default(0),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt").defaultNow().notNull(),
  },
  table => [index("race_sync_runs_source_started_idx").on(table.sourceId, table.startedAt)]
);

export type RaceSyncSource = typeof raceSyncSources.$inferSelect;
export type RaceSyncSnapshot = typeof raceSyncSnapshots.$inferSelect;
export type RaceSyncRun = typeof raceSyncRuns.$inferSelect;
