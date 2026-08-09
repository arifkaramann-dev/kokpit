CREATE TABLE `templateLayouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`templateId` varchar(64) NOT NULL,
	`layout` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templateLayouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `templateLayouts_company_template_uq` UNIQUE(`companyId`,`templateId`)
);
