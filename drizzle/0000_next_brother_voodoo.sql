CREATE TABLE `race_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`outcome` varchar(24) NOT NULL,
	`message` text,
	`racesChecked` int NOT NULL DEFAULT 0,
	`racesUpdated` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `race_sync_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`raceKey` varchar(255) NOT NULL,
	`raceDate` varchar(16),
	`organization` varchar(32),
	`venue` varchar(128),
	`raceNo` int,
	`raceStatus` varchar(48) NOT NULL,
	`calibrationStatus` varchar(64) NOT NULL,
	`asOf` varchar(64),
	`resultStatus` varchar(48),
	`aiPickFinish` int,
	`aiPickOutcome` varchar(48),
	`comparedCount` int,
	`exactMatches` int,
	`meanAbsoluteRankError` double,
	`winReturnRate` double,
	`placeReturnRate` double,
	`payloadJson` text NOT NULL,
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `race_sync_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `race_sync_snapshots_race_key_unique` UNIQUE(`raceKey`)
);
--> statement-breakpoint
CREATE TABLE `race_sync_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceKey` varchar(96) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`refreshMinutes` int NOT NULL DEFAULT 15,
	`scheduleCronTaskUid` varchar(65),
	`lastAttemptAt` timestamp,
	`lastSuccessAt` timestamp,
	`nextRetryAt` timestamp,
	`consecutiveFailures` int NOT NULL DEFAULT 0,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `race_sync_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `race_sync_sources_source_key_unique` UNIQUE(`sourceKey`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `race_sync_runs_source_started_idx` ON `race_sync_runs` (`sourceId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `race_sync_snapshots_source_idx` ON `race_sync_snapshots` (`sourceId`);--> statement-breakpoint
CREATE INDEX `race_sync_snapshots_result_idx` ON `race_sync_snapshots` (`resultStatus`);--> statement-breakpoint
CREATE INDEX `race_sync_sources_cron_task_idx` ON `race_sync_sources` (`scheduleCronTaskUid`);