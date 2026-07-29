CREATE TABLE `familyPackagings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`familyId` int NOT NULL,
	`packagingId` int NOT NULL,
	CONSTRAINT `familyPackagings_id` PRIMARY KEY(`id`),
	CONSTRAINT `familyPackagings_uq` UNIQUE(`familyId`,`packagingId`)
);
