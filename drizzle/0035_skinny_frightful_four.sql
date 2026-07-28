CREATE TABLE `contentBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`useCaseId` int NOT NULL,
	`familyId` int,
	`shortDescription` mediumtext,
	`longDescription` mediumtext,
	`applicationText` mediumtext,
	`labelText` text,
	`features` text,
	`titlePattern` varchar(255),
	`source` enum('sablon','ai','elle') NOT NULL DEFAULT 'sablon',
	`generatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contentBlocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `contentBlocks_coord_uq` UNIQUE(`companyId`,`seriesId`,`useCaseId`,`familyId`)
);
--> statement-breakpoint
CREATE INDEX `contentBlocks_series_idx` ON `contentBlocks` (`seriesId`);