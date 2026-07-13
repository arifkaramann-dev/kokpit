ALTER TABLE `orders` ADD `cargoTrackingNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `cargoProviderName` varchar(128);--> statement-breakpoint
ALTER TABLE `orders` ADD `cargoTrackingLink` varchar(512);