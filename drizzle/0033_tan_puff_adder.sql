CREATE TABLE `channelListings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`listingId` int NOT NULL,
	`masterId` int NOT NULL,
	`channelId` int NOT NULL,
	`channelSku` varchar(96) NOT NULL,
	`channelBarcode` varchar(64) NOT NULL,
	`channelCategoryId` varchar(64),
	`groupKey` varchar(96),
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	`discountPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`pushedQty` int NOT NULL DEFAULT 0,
	`syncState` enum('temiz','kirli','gonderiliyor','hata') NOT NULL DEFAULT 'kirli',
	`syncedAt` timestamp,
	`remoteId` varchar(128),
	`batchId` varchar(128),
	`lastError` text,
	`status` enum('taslak','canli','durduruldu') NOT NULL DEFAULT 'taslak',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channelListings_id` PRIMARY KEY(`id`),
	CONSTRAINT `channelListings_channel_sku_uq` UNIQUE(`channelId`,`channelSku`),
	CONSTRAINT `channelListings_channel_barcode_uq` UNIQUE(`channelId`,`channelBarcode`),
	CONSTRAINT `channelListings_listing_channel_uq` UNIQUE(`listingId`,`channelId`),
	CONSTRAINT `channelListings_master_channel_cat_uq` UNIQUE(`masterId`,`channelId`,`channelCategoryId`)
);
--> statement-breakpoint
CREATE TABLE `colors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`code` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`hex` varchar(16),
	`family` varchar(64),
	`finish` enum('duz','metalik','sedef','candy','neon','seffaf') NOT NULL DEFAULT 'duz',
	`seriesId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `colors_id` PRIMARY KEY(`id`),
	CONSTRAINT `colors_company_code_uq` UNIQUE(`companyId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `formulaInputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`formulaId` int NOT NULL,
	`inputMaterialId` int NOT NULL,
	`qtyPerBase` decimal(12,4) NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `formulaInputs_id` PRIMARY KEY(`id`),
	CONSTRAINT `formulaInputs_formula_material_uq` UNIQUE(`formulaId`,`inputMaterialId`)
);
--> statement-breakpoint
CREATE TABLE `formulas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`name` varchar(160) NOT NULL,
	`outputType` enum('yari_mamul','mamul') NOT NULL DEFAULT 'mamul',
	`outputMaterialId` int,
	`seriesId` int,
	`colorId` int,
	`familyId` int,
	`readiness` enum('konsantre','r2u'),
	`baseQty` decimal(12,3) NOT NULL DEFAULT '1000',
	`baseUnit` varchar(32) NOT NULL DEFAULT 'ml',
	`wastePercent` decimal(5,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `formulas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listingImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`listingId` int NOT NULL,
	`url` varchar(1024) NOT NULL,
	`role` varchar(32),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listingImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`masterId` int NOT NULL,
	`useCaseId` int NOT NULL,
	`isPrimary` tinyint NOT NULL DEFAULT 0,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255),
	`shortDescription` mediumtext,
	`longDescription` mediumtext,
	`applicationText` mediumtext,
	`seoTitle` varchar(255),
	`seoKeywords` text,
	`status` enum('taslak','aktif','arsiv') NOT NULL DEFAULT 'taslak',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`),
	CONSTRAINT `listings_master_usecase_uq` UNIQUE(`masterId`,`useCaseId`)
);
--> statement-breakpoint
CREATE TABLE `masterProducts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`colorId` int NOT NULL,
	`familyId` int NOT NULL,
	`packagingId` int NOT NULL,
	`readiness` enum('konsantre','r2u') NOT NULL DEFAULT 'konsantre',
	`baseCode` varchar(64),
	`internalSku` varchar(96) NOT NULL,
	`gtin` varchar(20),
	`formulaId` int,
	`formulaScale` decimal(10,4) NOT NULL DEFAULT '1',
	`buildableQty` int NOT NULL DEFAULT 0,
	`buildableComputedAt` timestamp,
	`virtualStockCap` int NOT NULL DEFAULT 10,
	`stockQty` int NOT NULL DEFAULT 0,
	`reservedQty` int NOT NULL DEFAULT 0,
	`criticalQty` int NOT NULL DEFAULT 0,
	`weightG` decimal(10,2),
	`desi` decimal(10,2),
	`avgCost` decimal(12,4) NOT NULL DEFAULT '0',
	`status` enum('taslak','aktif','arsiv') NOT NULL DEFAULT 'taslak',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `masterProducts_id` PRIMARY KEY(`id`),
	CONSTRAINT `masterProducts_cube_uq` UNIQUE(`companyId`,`seriesId`,`colorId`,`familyId`,`packagingId`,`readiness`),
	CONSTRAINT `masterProducts_sku_uq` UNIQUE(`companyId`,`internalSku`)
);
--> statement-breakpoint
CREATE TABLE `packagingInputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`packagingId` int NOT NULL,
	`materialId` int NOT NULL,
	`qtyPerUnit` decimal(12,4) NOT NULL DEFAULT '1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packagingInputs_id` PRIMARY KEY(`id`),
	CONSTRAINT `packagingInputs_pack_mat_uq` UNIQUE(`packagingId`,`materialId`)
);
--> statement-breakpoint
CREATE TABLE `packagings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`code` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`volumeMl` decimal(10,2) NOT NULL DEFAULT '0',
	`container` varchar(64),
	`materialId` int,
	`skuSegment` varchar(8),
	`weightG` decimal(10,2),
	`desi` decimal(10,2),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `packagings_id` PRIMARY KEY(`id`),
	CONSTRAINT `packagings_company_code_uq` UNIQUE(`companyId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `productFamilies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`code` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`skuSegment` varchar(8),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `productFamilies_id` PRIMARY KEY(`id`),
	CONSTRAINT `productFamilies_company_code_uq` UNIQUE(`companyId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `salesChannels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`code` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salesChannels_id` PRIMARY KEY(`id`),
	CONSTRAINT `salesChannels_company_code_uq` UNIQUE(`companyId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `seriesFamilies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`familyId` int NOT NULL,
	CONSTRAINT `seriesFamilies_id` PRIMARY KEY(`id`),
	CONSTRAINT `seriesFamilies_uq` UNIQUE(`seriesId`,`familyId`)
);
--> statement-breakpoint
CREATE TABLE `seriesPackagings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`seriesId` int NOT NULL,
	`packagingId` int NOT NULL,
	CONSTRAINT `seriesPackagings_id` PRIMARY KEY(`id`),
	CONSTRAINT `seriesPackagings_uq` UNIQUE(`seriesId`,`packagingId`)
);
--> statement-breakpoint
CREATE TABLE `useCases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`code` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`titlePattern` varchar(255),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `useCases_id` PRIMARY KEY(`id`),
	CONSTRAINT `useCases_company_code_uq` UNIQUE(`companyId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `materials` ADD `type` enum('hammadde','yari_mamul','ambalaj','masraf') DEFAULT 'hammadde' NOT NULL;--> statement-breakpoint
ALTER TABLE `materials` ADD `reservedQty` decimal(12,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `materials` ADD `safetyQty` decimal(12,3) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX `channelListings_master_idx` ON `channelListings` (`masterId`);--> statement-breakpoint
CREATE INDEX `channelListings_sync_idx` ON `channelListings` (`channelId`,`syncState`);--> statement-breakpoint
CREATE INDEX `colors_series_idx` ON `colors` (`seriesId`);--> statement-breakpoint
CREATE INDEX `formulaInputs_material_idx` ON `formulaInputs` (`inputMaterialId`);--> statement-breakpoint
CREATE INDEX `formulas_output_material_idx` ON `formulas` (`outputMaterialId`);--> statement-breakpoint
CREATE INDEX `formulas_coord_idx` ON `formulas` (`seriesId`,`colorId`,`familyId`);--> statement-breakpoint
CREATE INDEX `listingImages_listing_idx` ON `listingImages` (`listingId`);--> statement-breakpoint
CREATE INDEX `listings_master_idx` ON `listings` (`masterId`);--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE INDEX `masterProducts_baseCode_idx` ON `masterProducts` (`baseCode`);--> statement-breakpoint
CREATE INDEX `masterProducts_formula_idx` ON `masterProducts` (`formulaId`);--> statement-breakpoint
CREATE INDEX `masterProducts_status_idx` ON `masterProducts` (`status`);--> statement-breakpoint
CREATE INDEX `packagingInputs_material_idx` ON `packagingInputs` (`materialId`);