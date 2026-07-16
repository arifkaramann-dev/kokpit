CREATE TABLE `quoteItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`quoteId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`productId` int,
	`quantity` decimal(12,2) NOT NULL DEFAULT '1',
	`unitPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quoteItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`quoteNo` varchar(32) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerId` int,
	`customerPhone` varchar(64),
	`customerAddress` varchar(512),
	`status` enum('draft','sent','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft',
	`validUntil` timestamp,
	`totalAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`itemsSummary` text,
	`notes` text,
	`orderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `criticalQty` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `quoteItems_quoteId_idx` ON `quoteItems` (`quoteId`);--> statement-breakpoint
CREATE INDEX `quotes_quoteNo_idx` ON `quotes` (`quoteNo`);--> statement-breakpoint
CREATE INDEX `quotes_customerId_idx` ON `quotes` (`customerId`);--> statement-breakpoint
CREATE INDEX `quotes_createdAt_idx` ON `quotes` (`createdAt`);