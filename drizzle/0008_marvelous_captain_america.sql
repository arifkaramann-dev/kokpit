CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('eksik','gorev') NOT NULL DEFAULT 'gorev',
	`title` varchar(500) NOT NULL,
	`note` text,
	`status` enum('open','done') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`doneAt` timestamp,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
