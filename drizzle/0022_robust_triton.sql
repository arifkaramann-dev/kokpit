CREATE TABLE `marketplaceQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`source` enum('trendyol','hepsiburada','n11','ciceksepeti','whatsapp','email','elle') NOT NULL DEFAULT 'elle',
	`externalId` varchar(128),
	`customerName` varchar(255),
	`questionText` text NOT NULL,
	`productId` int,
	`productName` varchar(255),
	`status` enum('new','answered','dismissed') NOT NULL DEFAULT 'new',
	`answerDraft` text,
	`answerText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	CONSTRAINT `marketplaceQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mpQuestions_status_idx` ON `marketplaceQuestions` (`status`);--> statement-breakpoint
CREATE INDEX `mpQuestions_source_ext_idx` ON `marketplaceQuestions` (`source`,`externalId`);