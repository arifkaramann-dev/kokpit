ALTER TABLE `colors` DROP INDEX `colors_company_displayCode_uq`;--> statement-breakpoint
ALTER TABLE `colors` ADD `colorNo` int;--> statement-breakpoint
ALTER TABLE `colors` ADD CONSTRAINT `colors_company_colorNo_uq` UNIQUE(`companyId`,`colorNo`);--> statement-breakpoint
ALTER TABLE `colors` DROP COLUMN `displayCode`;