ALTER TABLE `colors` ADD `displayCode` varchar(32);--> statement-breakpoint
ALTER TABLE `colors` ADD CONSTRAINT `colors_company_displayCode_uq` UNIQUE(`companyId`,`displayCode`);