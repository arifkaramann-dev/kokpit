CREATE TABLE `sampleMasters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`objectType` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`data` mediumtext,
	`baseHex` varchar(16),
	`prompt` text,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sampleMasters_id` PRIMARY KEY(`id`),
	CONSTRAINT `sampleMasters_company_object_uq` UNIQUE(`companyId`,`objectType`)
);
