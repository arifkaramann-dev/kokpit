CREATE TABLE `seriesColors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`colorId` int NOT NULL,
	CONSTRAINT `seriesColors_id` PRIMARY KEY(`id`),
	CONSTRAINT `seriesColors_uq` UNIQUE(`seriesId`,`colorId`)
);
--> statement-breakpoint
CREATE INDEX `seriesColors_color_idx` ON `seriesColors` (`colorId`);