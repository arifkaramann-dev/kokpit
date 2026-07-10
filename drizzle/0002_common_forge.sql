CREATE TABLE `devProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`targetUse` text,
	`series` varchar(128),
	`colorCode` varchar(64),
	`colorHex` varchar(16),
	`status` enum('active','done','archived') NOT NULL DEFAULT 'active',
	`currentStep` int NOT NULL DEFAULT 1,
	`applicationNotes` text,
	`dryingTime` varchar(128),
	`coats` varchar(64),
	`testNotes` text,
	`packagingCost` decimal(12,2) NOT NULL DEFAULT '0',
	`shippingCost` decimal(12,2) NOT NULL DEFAULT '0',
	`salePrice` decimal(12,2) NOT NULL DEFAULT '0',
	`productId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devTrialItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trialId` int NOT NULL,
	`materialId` int NOT NULL,
	`qty` decimal(12,3) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `devTrialItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devTrials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`trialNo` int NOT NULL,
	`result` enum('pending','success','partial','fail') NOT NULL DEFAULT 'pending',
	`isChosen` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `devTrials_id` PRIMARY KEY(`id`)
);
