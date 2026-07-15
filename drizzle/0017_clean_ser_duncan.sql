CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(48) NOT NULL DEFAULT 'genel',
	`title` varchar(255) NOT NULL,
	`body` text,
	`link` varchar(255),
	`status` enum('unread','read') NOT NULL DEFAULT 'unread',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`type` enum('in','out') NOT NULL,
	`qty` decimal(12,2) NOT NULL,
	`note` text,
	`orderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productionRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`qty` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productionRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `status` enum('new','production','ready','done','cancelled') NOT NULL DEFAULT 'new';--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`);--> statement-breakpoint
CREATE INDEX `notifications_createdAt_idx` ON `notifications` (`createdAt`);--> statement-breakpoint
CREATE INDEX `productMovements_productId_idx` ON `productMovements` (`productId`);--> statement-breakpoint
CREATE INDEX `productMovements_orderId_idx` ON `productMovements` (`orderId`);--> statement-breakpoint
CREATE INDEX `productionRuns_productId_idx` ON `productionRuns` (`productId`);