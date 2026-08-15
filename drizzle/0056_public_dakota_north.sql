CREATE TABLE `seriesUseCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`useCaseId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `seriesUseCases_id` PRIMARY KEY(`id`),
	CONSTRAINT `seriesUseCases_uq` UNIQUE(`seriesId`,`useCaseId`)
);
--> statement-breakpoint
CREATE TABLE `socialPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`kind` enum('renk','katsistemi','kullanim','palet') NOT NULL,
	`status` enum('taslak','onaylandi','paylasildi','atlandi') NOT NULL DEFAULT 'taslak',
	`plannedFor` varchar(10) NOT NULL,
	`seriesId` int,
	`colorId` int,
	`masterId` int,
	`imageId` int,
	`storyImageId` int,
	`caption` text,
	`hashtags` text,
	`postedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `socialPosts_id` PRIMARY KEY(`id`),
	CONSTRAINT `socialPosts_slot_uq` UNIQUE(`companyId`,`plannedFor`,`kind`)
);
--> statement-breakpoint
ALTER TABLE `productSeries` ADD `coatSystem` json;--> statement-breakpoint
ALTER TABLE `productSeries` ADD `bannerSlogan` varchar(160);--> statement-breakpoint
ALTER TABLE `productSeries` ADD `bannerBullets` json;--> statement-breakpoint
CREATE INDEX `seriesUseCases_usecase_idx` ON `seriesUseCases` (`useCaseId`);--> statement-breakpoint
CREATE INDEX `socialPosts_status_idx` ON `socialPosts` (`status`,`plannedFor`);