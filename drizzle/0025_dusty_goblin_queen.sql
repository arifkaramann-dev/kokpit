CREATE TABLE `materialLots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`materialId` int NOT NULL,
	`lotNo` varchar(64) NOT NULL,
	`receivedDate` timestamp NOT NULL DEFAULT (now()),
	`expiryDate` timestamp,
	`qty` decimal(12,3) NOT NULL,
	`remainingQty` decimal(12,3) NOT NULL,
	`unitCost` decimal(12,4) NOT NULL DEFAULT '0',
	`supplierId` int,
	`purchaseId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `materialLots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`productId` int NOT NULL,
	`batchNo` varchar(64) NOT NULL,
	`producedDate` timestamp NOT NULL DEFAULT (now()),
	`expiryDate` timestamp,
	`qty` decimal(12,2) NOT NULL,
	`productionRunId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qcTests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`productBatchId` int,
	`materialLotId` int,
	`productionRunId` int,
	`ph` decimal(5,2),
	`viscosity` decimal(10,2),
	`opacity` decimal(6,2),
	`deltaE` decimal(6,2),
	`result` enum('gecti','kaldi','beklemede') NOT NULL DEFAULT 'beklemede',
	`note` text,
	`testedBy` varchar(128),
	`testedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qcTests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `materials` ADD `shelfLifeDays` int;--> statement-breakpoint
ALTER TABLE `products` ADD `shelfLifeDays` int;--> statement-breakpoint
CREATE INDEX `materialLots_materialId_idx` ON `materialLots` (`materialId`);--> statement-breakpoint
CREATE INDEX `materialLots_expiryDate_idx` ON `materialLots` (`expiryDate`);--> statement-breakpoint
CREATE INDEX `materialLots_purchaseId_idx` ON `materialLots` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `productBatches_productId_idx` ON `productBatches` (`productId`);--> statement-breakpoint
CREATE INDEX `productBatches_expiryDate_idx` ON `productBatches` (`expiryDate`);--> statement-breakpoint
CREATE INDEX `productBatches_runId_idx` ON `productBatches` (`productionRunId`);--> statement-breakpoint
CREATE INDEX `qcTests_productBatchId_idx` ON `qcTests` (`productBatchId`);--> statement-breakpoint
CREATE INDEX `qcTests_materialLotId_idx` ON `qcTests` (`materialLotId`);--> statement-breakpoint
CREATE INDEX `qcTests_result_idx` ON `qcTests` (`result`);