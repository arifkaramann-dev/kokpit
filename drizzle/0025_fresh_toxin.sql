CREATE TABLE `orderEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`orderId` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`message` varchar(500) NOT NULL,
	`meta` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `orderEvents_orderId_idx` ON `orderEvents` (`orderId`);