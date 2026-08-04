CREATE TABLE `channelAttributeOptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`channelId` int NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`attributeId` int NOT NULL,
	`valueId` int NOT NULL,
	`valueName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channelAttributeOptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `channelAttributeOptions_uq` UNIQUE(`channelId`,`categoryId`,`attributeId`,`valueId`)
);
--> statement-breakpoint
CREATE INDEX `channelAttributeOptions_attr_idx` ON `channelAttributeOptions` (`channelId`,`categoryId`,`attributeId`);