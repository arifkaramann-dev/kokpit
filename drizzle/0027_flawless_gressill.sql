CREATE TABLE `whatsappAuth` (
	`name` varchar(191) NOT NULL,
	`data` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappAuth_name` PRIMARY KEY(`name`)
);
