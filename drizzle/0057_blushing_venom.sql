ALTER TABLE `productSeries` ADD `accentColor` varchar(9);--> statement-breakpoint
-- Kaldırılan şablonların kayıtlı yerleşimleri.
--
-- `social` renk kartının BİREBİR kopyasıydı (aynı tarif, aynı ölçü), `range`
-- ürün karesiyle birleşti, `coats` ise kat sistemi şemasının içine girdi.
-- Üçü de artık üretilmiyor; düzenlenmiş yerleşimleri kalırsa hiçbir şeye
-- bağlı olmayan ölü kayıt olur ve editörde "düzenlendi" rozetiyle görünmeye
-- devam ederdi.
DELETE FROM `templateLayouts` WHERE `templateId` IN ('social', 'range', 'coats');
