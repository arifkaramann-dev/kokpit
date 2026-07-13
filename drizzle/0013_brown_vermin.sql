CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`kind` enum('kasa','banka') NOT NULL DEFAULT 'kasa',
	`openingBalance` decimal(14,2) NOT NULL DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`txnDate` timestamp NOT NULL DEFAULT (now()),
	`accountId` int,
	`direction` enum('in','out') NOT NULL,
	`amount` decimal(14,2) NOT NULL DEFAULT '0',
	`category` varchar(48) NOT NULL DEFAULT 'diğer',
	`customerName` varchar(255),
	`orderId` int,
	`orderNo` varchar(32),
	`description` varchar(255),
	`method` varchar(64),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
