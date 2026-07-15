ALTER TABLE `orderItems` ADD `productId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `purchases` ADD `supplierId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `supplierId` int;--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `formulaItems_productId_idx` ON `formulaItems` (`productId`);--> statement-breakpoint
CREATE INDEX `formulaItems_materialId_idx` ON `formulaItems` (`materialId`);--> statement-breakpoint
CREATE INDEX `orderItems_orderId_idx` ON `orderItems` (`orderId`);--> statement-breakpoint
CREATE INDEX `orderItems_productId_idx` ON `orderItems` (`productId`);--> statement-breakpoint
CREATE INDEX `orders_orderNo_idx` ON `orders` (`orderNo`);--> statement-breakpoint
CREATE INDEX `orders_customerId_idx` ON `orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `orders_createdAt_idx` ON `orders` (`createdAt`);--> statement-breakpoint
CREATE INDEX `productImages_productId_kind_idx` ON `productImages` (`productId`,`kind`);--> statement-breakpoint
CREATE INDEX `products_parentId_idx` ON `products` (`parentId`);--> statement-breakpoint
CREATE INDEX `products_barcode_idx` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `purchaseItems_purchaseId_idx` ON `purchaseItems` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `purchaseItems_materialId_idx` ON `purchaseItems` (`materialId`);--> statement-breakpoint
CREATE INDEX `purchases_supplierId_idx` ON `purchases` (`supplierId`);--> statement-breakpoint
CREATE INDEX `stockMovements_materialId_idx` ON `stockMovements` (`materialId`);--> statement-breakpoint
CREATE INDEX `suppliers_name_idx` ON `suppliers` (`name`);--> statement-breakpoint
CREATE INDEX `transactions_customerId_idx` ON `transactions` (`customerId`);--> statement-breakpoint
CREATE INDEX `transactions_supplierId_idx` ON `transactions` (`supplierId`);--> statement-breakpoint
CREATE INDEX `transactions_accountId_idx` ON `transactions` (`accountId`);--> statement-breakpoint
CREATE INDEX `transactions_orderId_idx` ON `transactions` (`orderId`);--> statement-breakpoint
CREATE INDEX `transactions_txnDate_idx` ON `transactions` (`txnDate`);--> statement-breakpoint
UPDATE `orders` o
JOIN (SELECT LOWER(TRIM(`name`)) AS n, MIN(`id`) AS id FROM `customers` GROUP BY LOWER(TRIM(`name`))) c
  ON LOWER(TRIM(o.`customerName`)) = c.n
SET o.`customerId` = c.id
WHERE o.`customerId` IS NULL;--> statement-breakpoint
UPDATE `transactions` t
JOIN (SELECT LOWER(TRIM(`name`)) AS n, MIN(`id`) AS id FROM `customers` GROUP BY LOWER(TRIM(`name`))) c
  ON t.`customerName` IS NOT NULL AND LOWER(TRIM(t.`customerName`)) = c.n
SET t.`customerId` = c.id
WHERE t.`customerId` IS NULL;--> statement-breakpoint
UPDATE `transactions` t
JOIN (SELECT LOWER(TRIM(`name`)) AS n, MIN(`id`) AS id FROM `suppliers` GROUP BY LOWER(TRIM(`name`))) s
  ON t.`supplierName` IS NOT NULL AND LOWER(TRIM(t.`supplierName`)) = s.n
SET t.`supplierId` = s.id
WHERE t.`supplierId` IS NULL;--> statement-breakpoint
UPDATE `purchases` p
JOIN (SELECT LOWER(TRIM(`name`)) AS n, MIN(`id`) AS id FROM `suppliers` GROUP BY LOWER(TRIM(`name`))) s
  ON p.`supplierName` IS NOT NULL AND LOWER(TRIM(p.`supplierName`)) = s.n
SET p.`supplierId` = s.id
WHERE p.`supplierId` IS NULL;--> statement-breakpoint
UPDATE `orderItems` oi
JOIN (SELECT LOWER(TRIM(`name`)) AS n, MIN(`id`) AS id FROM `products` GROUP BY LOWER(TRIM(`name`))) p
  ON LOWER(TRIM(oi.`productName`)) = p.n
SET oi.`productId` = p.id
WHERE oi.`productId` IS NULL;