ALTER TABLE `products` ADD `barcode` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `stockQty` int DEFAULT 0 NOT NULL;