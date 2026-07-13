CREATE TABLE `quoteItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`quantity` decimal(12,2) NOT NULL DEFAULT '1',
	`unitPrice` decimal(12,2) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quoteItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quoteNo` varchar(32) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerPhone` varchar(64),
	`customerAddress` varchar(512),
	`validUntil` timestamp,
	`status` enum('draft','sent','accepted','rejected','converted') NOT NULL DEFAULT 'draft',
	`totalAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`itemsSummary` text,
	`notes` text,
	`convertedOrderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
