CREATE TABLE `materialReservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`orderId` int NOT NULL,
	`materialId` int NOT NULL,
	`qty` decimal(12,3) NOT NULL,
	`state` enum('rezerve','tuketildi','iptal') NOT NULL DEFAULT 'rezerve',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `materialReservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `masterProducts` ADD `basePrice` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `masterProducts` ADD `discountPercent` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX `materialReservations_order_idx` ON `materialReservations` (`orderId`,`state`);--> statement-breakpoint
CREATE INDEX `materialReservations_material_idx` ON `materialReservations` (`materialId`,`state`);