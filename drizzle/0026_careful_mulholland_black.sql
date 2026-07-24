ALTER TABLE `customers` ADD `taxOffice` varchar(128);--> statement-breakpoint
ALTER TABLE `customers` ADD `taxNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `customers` ADD `eInvoice` enum('bilinmiyor','efatura','earsiv') DEFAULT 'bilinmiyor' NOT NULL;