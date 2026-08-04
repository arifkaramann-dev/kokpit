CREATE TABLE `marketplaceBatchJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`channelListingId` int NOT NULL,
	`marketplace` varchar(50) NOT NULL,
	`batchRequestId` varchar(255) NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `marketplaceBatchJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `marketplaceBatchJobs_listing_status_idx` ON `marketplaceBatchJobs` (`channelListingId`,`status`);--> statement-breakpoint
CREATE INDEX `marketplaceBatchJobs_batchRequestId_idx` ON `marketplaceBatchJobs` (`batchRequestId`);--> statement-breakpoint
CREATE INDEX `marketplaceBatchJobs_created_status_idx` ON `marketplaceBatchJobs` (`createdAt`,`status`);--> statement-breakpoint
CREATE INDEX `marketplaceBatchJobs_listing_created_idx` ON `marketplaceBatchJobs` (`channelListingId`,`createdAt`);