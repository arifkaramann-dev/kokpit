CREATE TABLE `formulaScopes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL DEFAULT 1,
	`formulaId` int NOT NULL,
	`kind` enum('seri','renk','form','hazirlik') NOT NULL,
	`valueId` int NOT NULL,
	CONSTRAINT `formulaScopes_id` PRIMARY KEY(`id`),
	CONSTRAINT `formulaScopes_uq` UNIQUE(`formulaId`,`kind`,`valueId`)
);
--> statement-breakpoint
CREATE INDEX `formulaScopes_formula_idx` ON `formulaScopes` (`formulaId`);