CREATE TABLE `crmOpportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`title` varchar(255) NOT NULL,
	`customerId` int,
	`customerName` varchar(255),
	`customerPhone` varchar(64),
	`expectedAmount` decimal(12,2) DEFAULT '0',
	`stage` enum('yeni','gorusme','teklif','kazanildi','kaybedildi') NOT NULL DEFAULT 'yeni',
	`nextStep` varchar(255),
	`nextStepDate` timestamp,
	`note` text,
	`quoteId` int,
	`orderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crmOpportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `crmOpp_stage_idx` ON `crmOpportunities` (`stage`);--> statement-breakpoint
CREATE INDEX `crmOpp_customer_idx` ON `crmOpportunities` (`customerId`);