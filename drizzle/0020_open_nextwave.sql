CREATE TABLE `productSeries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`name` varchar(128) NOT NULL,
	`profitMargin` decimal(5,2) NOT NULL DEFAULT '35',
	`vatRate` decimal(5,2) NOT NULL DEFAULT '20',
	`category` varchar(64),
	`shortDescription` mediumtext,
	`longDescription` mediumtext,
	`applicationText` mediumtext,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productSeries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `templates` MODIFY COLUMN `kind` enum('etiket_boyutu','etiket_yazisi','kilavuz','guvenlik','ambalaj','renk','set_paket','hammadde_kategori','uygulama_yontemi','kuruma_suresi','kat_sayisi','test_sonucu','ozellik','urun_turu','zemin','kategori') NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sku` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `category` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `profitMargin` decimal(5,2);--> statement-breakpoint
ALTER TABLE `products` ADD `vatRate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `products` ADD `desi` decimal(8,2);--> statement-breakpoint
ALTER TABLE `products` ADD `paintType` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `features` text;--> statement-breakpoint
ALTER TABLE `products` ADD `shortDescription` mediumtext;--> statement-breakpoint
ALTER TABLE `products` ADD `longDescription` mediumtext;--> statement-breakpoint
ALTER TABLE `products` ADD `applicationText` mediumtext;--> statement-breakpoint
ALTER TABLE `products` ADD `imageUrls` text;--> statement-breakpoint
ALTER TABLE `products` ADD `videoUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `products` ADD `mockupUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `products` ADD `labelWarnings` text;