CREATE TABLE `cheques` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('cek','senet') NOT NULL DEFAULT 'cek',
	`direction` enum('alinan','verilen') NOT NULL DEFAULT 'alinan',
	`partyName` varchar(255),
	`bank` varchar(128),
	`serialNo` varchar(64),
	`amount` decimal(14,2) NOT NULL DEFAULT '0',
	`dueDate` timestamp,
	`status` enum('portfoyde','tahsil','odendi','karsiliksiz','iade') NOT NULL DEFAULT 'portfoyde',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cheques_id` PRIMARY KEY(`id`)
);
