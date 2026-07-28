CREATE TABLE `useCaseChannelCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`useCaseId` int NOT NULL,
	`channelId` int NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`categoryName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `useCaseChannelCategories_id` PRIMARY KEY(`id`),
	CONSTRAINT `useCaseChannelCategories_uq` UNIQUE(`useCaseId`,`channelId`)
);
