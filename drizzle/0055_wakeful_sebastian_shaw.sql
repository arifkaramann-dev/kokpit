CREATE TABLE `seriesColorNumbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`colorId` int NOT NULL,
	`colorNo` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seriesColorNumbers_id` PRIMARY KEY(`id`),
	CONSTRAINT `seriesColorNumbers_uq` UNIQUE(`seriesId`,`colorId`),
	CONSTRAINT `seriesColorNumbers_no_uq` UNIQUE(`companyId`,`seriesId`,`colorNo`)
);
--> statement-breakpoint
CREATE INDEX `seriesColorNumbers_color_idx` ON `seriesColorNumbers` (`colorId`);