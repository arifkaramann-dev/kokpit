ALTER TABLE `masterImages` MODIFY COLUMN `url` varchar(1024);--> statement-breakpoint
ALTER TABLE `marketplaceQuestions` ADD `masterId` int;--> statement-breakpoint
ALTER TABLE `masterImages` ADD `data` mediumtext;--> statement-breakpoint
ALTER TABLE `orderItems` ADD `channelRef` varchar(64);--> statement-breakpoint
ALTER TABLE `orderItems` ADD `masterId` int;--> statement-breakpoint
ALTER TABLE `productionRuns` ADD `masterId` int;--> statement-breakpoint
ALTER TABLE `quoteItems` ADD `masterId` int;--> statement-breakpoint
CREATE INDEX `orderItems_master_idx` ON `orderItems` (`masterId`);--> statement-breakpoint
CREATE INDEX `orderItems_channelRef_idx` ON `orderItems` (`channelRef`);--> statement-breakpoint
CREATE INDEX `productionRuns_master_idx` ON `productionRuns` (`masterId`);