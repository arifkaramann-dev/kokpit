CREATE TABLE `assistantPendingActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`sessionKey` varchar(128) NOT NULL,
	`transcript` text NOT NULL,
	`payload` text NOT NULL,
	`intentClass` varchar(16) NOT NULL,
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `assistantPendingActions_id` PRIMARY KEY(`id`),
	CONSTRAINT `assistantPendingActions_sessionKey_unique` UNIQUE(`sessionKey`)
);
--> statement-breakpoint
CREATE INDEX `assistantPendingActions_expiresAt_idx` ON `assistantPendingActions` (`expiresAt`);