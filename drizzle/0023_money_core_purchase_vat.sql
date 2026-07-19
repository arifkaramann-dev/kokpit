ALTER TABLE `purchaseItems` ADD `vatRate` decimal(5,2) DEFAULT '20' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `netTotal` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `vatTotal` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
-- Geriye dönük düzeltme (net/brüt tutarlılığı, Tema 0 #3):
-- 0023 öncesi `purchases.totalAmount` NET (Σ qty×unitCost) yazılıyordu. Satır bazlı KDV
-- oranı o dönemde tutulmadığı için eski faturalarda %20 varsayılır (boya dikeyinde ana oran).
-- 1) net ve KDV'yi eski (net) totalAmount'tan türet, 2) totalAmount'ı BRÜT'e (net+KDV) çevir.
UPDATE `purchases` SET `netTotal` = `totalAmount`, `vatTotal` = ROUND(`totalAmount` * 0.20, 2);--> statement-breakpoint
UPDATE `purchases` SET `totalAmount` = `netTotal` + `vatTotal`;
