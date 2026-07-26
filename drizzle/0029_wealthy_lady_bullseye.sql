ALTER TABLE `productGenerations` MODIFY COLUMN `variantCode` varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE `devProjects` ADD `colorSelection` json;--> statement-breakpoint
ALTER TABLE `productGenerations` ADD `color` varchar(64);--> statement-breakpoint
ALTER TABLE `productGenerations` ADD `colorHex` varchar(16);--> statement-breakpoint
ALTER TABLE `productSeries` ADD `colorOptions` json;