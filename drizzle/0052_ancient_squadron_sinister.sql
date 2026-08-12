CREATE TABLE `packagingImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`packagingId` int NOT NULL,
	`seriesId` int,
	`data` mediumtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `packagingImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `packagingImages_pack_idx` ON `packagingImages` (`packagingId`);--> statement-breakpoint
CREATE INDEX `packagingImages_series_idx` ON `packagingImages` (`seriesId`);