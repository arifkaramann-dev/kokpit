CREATE TABLE `productImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`kind` enum('main','packaging','usage') NOT NULL,
	`data` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('etiket_boyutu','etiket_yazisi','kilavuz','guvenlik','ambalaj','renk','hammadde_kategori','uygulama_yontemi','kuruma_suresi','kat_sayisi','test_sonucu') NOT NULL,
	`name` varchar(255) NOT NULL,
	`content` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `devProjects` ADD `description` text;--> statement-breakpoint
ALTER TABLE `devProjects` ADD `packaging` varchar(128);--> statement-breakpoint
ALTER TABLE `devProjects` ADD `labelSize` varchar(64);--> statement-breakpoint
ALTER TABLE `devProjects` ADD `labelText` text;--> statement-breakpoint
ALTER TABLE `devProjects` ADD `usageGuide` text;--> statement-breakpoint
ALTER TABLE `devProjects` ADD `safetyNotes` text;--> statement-breakpoint
ALTER TABLE `products` ADD `packaging` varchar(128);