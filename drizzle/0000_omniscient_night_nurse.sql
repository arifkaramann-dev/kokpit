CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`productGroup` varchar(255),
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`discountPercent` decimal(5,2) DEFAULT '0',
	`note` text,
	`status` enum('planned','active','done') NOT NULL DEFAULT 'planned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `formulaItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`materialId` int NOT NULL,
	`qty` decimal(12,3) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `formulaItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketingTexts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentType` varchar(64) NOT NULL,
	`productName` varchar(255),
	`prompt` text,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketingTexts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'diğer',
	`unit` varchar(32) NOT NULL DEFAULT 'gr',
	`stockQty` decimal(12,3) NOT NULL DEFAULT '0',
	`criticalQty` decimal(12,3) NOT NULL DEFAULT '0',
	`unitCost` decimal(12,4) NOT NULL DEFAULT '0',
	`supplierId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNo` varchar(32) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`channel` varchar(64) DEFAULT 'web',
	`status` enum('new','production','ready','done') NOT NULL DEFAULT 'new',
	`totalAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`itemsSummary` text,
	`notes` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int,
	`name` varchar(255) NOT NULL,
	`series` varchar(128),
	`colorCode` varchar(64),
	`colorHex` varchar(16),
	`surfaceType` varchar(255),
	`additives` text,
	`description` text,
	`salePrice` decimal(12,2) NOT NULL DEFAULT '0',
	`discountPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`packagingCost` decimal(12,2) NOT NULL DEFAULT '0',
	`shippingCost` decimal(12,2) NOT NULL DEFAULT '0',
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stockMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`type` enum('in','out') NOT NULL,
	`qty` decimal(12,3) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stockMovements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`contactPerson` varchar(255),
	`phone` varchar(64),
	`email` varchar(320),
	`suppliesText` text,
	`lastOrderDate` timestamp,
	`priceNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
