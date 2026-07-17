ALTER TABLE `products` ADD `status` enum('taslak','satista','arsiv') DEFAULT 'satista' NOT NULL;--> statement-breakpoint
UPDATE `products` SET `status` = 'arsiv' WHERE `isActive` = 0;