DROP TABLE `formulaItems`;--> statement-breakpoint
DROP TABLE `productImages`;--> statement-breakpoint
DROP TABLE `productMovements`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
DROP INDEX `productionRuns_productId_idx` ON `productionRuns`;--> statement-breakpoint
ALTER TABLE `productionRuns` DROP COLUMN `productId`;