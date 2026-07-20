CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`name` varchar(255) NOT NULL,
	`phone` varchar(64),
	`email` varchar(320),
	`source` varchar(64) NOT NULL DEFAULT 'diğer',
	`stage` enum('yeni','iletisim','teklif','kazanildi','kaybedildi') NOT NULL DEFAULT 'yeni',
	`estimatedValue` decimal(12,2) NOT NULL DEFAULT '0',
	`note` text,
	`customerId` int,
	`quoteId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `leads_stage_idx` ON `leads` (`stage`);