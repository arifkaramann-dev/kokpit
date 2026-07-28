CREATE TABLE `channelAttributeValues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`channelId` int NOT NULL,
	`attributeId` int NOT NULL,
	`dimensionKind` enum('renk','ambalaj','form','seri') NOT NULL,
	`dimensionId` int NOT NULL,
	`attributeValueId` int,
	`attributeText` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channelAttributeValues_id` PRIMARY KEY(`id`),
	CONSTRAINT `channelAttributeValues_uq` UNIQUE(`channelId`,`attributeId`,`dimensionKind`,`dimensionId`)
);
--> statement-breakpoint
CREATE TABLE `channelAttributes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`channelId` int NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`attributeId` int NOT NULL,
	`attributeName` varchar(160),
	`source` enum('renk','ambalaj','form','seri','hacim','sabit') NOT NULL DEFAULT 'sabit',
	`constantValueId` int,
	`constantText` varchar(255),
	`isRequired` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channelAttributes_id` PRIMARY KEY(`id`),
	CONSTRAINT `channelAttributes_uq` UNIQUE(`channelId`,`categoryId`,`attributeId`)
);
--> statement-breakpoint
CREATE TABLE `masterImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`masterId` int NOT NULL,
	`url` varchar(1024) NOT NULL,
	`role` varchar(32),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `masterImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `channelAttributes_cat_idx` ON `channelAttributes` (`channelId`,`categoryId`);--> statement-breakpoint
CREATE INDEX `masterImages_master_idx` ON `masterImages` (`masterId`);