CREATE TABLE `productGenerations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`projectId` int NOT NULL,
	`variantCode` varchar(80) NOT NULL,
	`packaging` varchar(64) NOT NULL,
	`status` enum('generating','ready','listed','error') NOT NULL DEFAULT 'ready',
	`trendyolTitle` varchar(255),
	`trendyolDescription` mediumtext,
	`hepsiburadaTitle` varchar(255),
	`hepsiburadaDescription` mediumtext,
	`labelContent` text,
	`guideContent` text,
	`applicationNotes` text,
	`suggestedPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`costPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productGenerations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `devProjects` ADD `autoCode` varchar(50);--> statement-breakpoint
ALTER TABLE `devProjects` ADD `targetSurfaces` json;--> statement-breakpoint
ALTER TABLE `devProjects` ADD `packagingSelection` json;--> statement-breakpoint
ALTER TABLE `materials` ADD `tier` varchar(20);--> statement-breakpoint
ALTER TABLE `materials` ADD `pricePerUnit` decimal(10,4);--> statement-breakpoint
ALTER TABLE `materials` ADD `supplier` varchar(100);--> statement-breakpoint
ALTER TABLE `productSeries` ADD `prefix` varchar(10);--> statement-breakpoint
ALTER TABLE `productSeries` ADD `packagingOptions` json;--> statement-breakpoint
ALTER TABLE `productSeries` ADD `applicationSurfaces` json;--> statement-breakpoint
ALTER TABLE `productSeries` ADD `guideTemplate` text;--> statement-breakpoint
ALTER TABLE `productSeries` ADD `labelTemplate` text;--> statement-breakpoint
CREATE INDEX `productGenerations_projectId_idx` ON `productGenerations` (`projectId`);