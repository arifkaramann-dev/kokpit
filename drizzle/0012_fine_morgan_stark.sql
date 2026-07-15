CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(64),
	`email` varchar(320),
	`address` varchar(512),
	`city` varchar(128),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseDate` timestamp NOT NULL DEFAULT (now()),
	`category` varchar(64) NOT NULL DEFAULT 'diğer',
	`description` varchar(255),
	`amount` decimal(12,2) NOT NULL DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `customerPhone` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `customerAddress` varchar(512);--> statement-breakpoint
ALTER TABLE `orders` ADD `paymentStatus` enum('unpaid','partial','paid') DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paidAmount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `paymentMethod` varchar(64);