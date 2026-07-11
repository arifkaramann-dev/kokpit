CREATE TABLE `purchaseItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int NOT NULL,
	`materialId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`qty` decimal(12,3) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'adet',
	`unitCost` decimal(12,4) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(255),
	`invoiceNo` varchar(64),
	`invoiceDate` timestamp,
	`totalAmount` decimal(12,2) NOT NULL DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
