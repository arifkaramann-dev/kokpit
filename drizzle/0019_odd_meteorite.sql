CREATE TABLE `marketplaceQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`marketplace` varchar(32) NOT NULL,
	`questionId` varchar(64) NOT NULL,
	`productId` int,
	`productBarcode` varchar(128),
	`customerName` varchar(255),
	`questionText` text NOT NULL,
	`askedAt` timestamp,
	`status` enum('open','draft','answered','rejected') NOT NULL DEFAULT 'open',
	`draftAnswer` text,
	`finalAnswer` text,
	`answeredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceQuestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketplaceQuestions_marketplace_questionId_idx` UNIQUE(`marketplace`,`questionId`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `criticalQty` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `tokenVersion` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `marketplaceQuestions_status_idx` ON `marketplaceQuestions` (`status`);--> statement-breakpoint
CREATE INDEX `marketplaceQuestions_askedAt_idx` ON `marketplaceQuestions` (`askedAt`);