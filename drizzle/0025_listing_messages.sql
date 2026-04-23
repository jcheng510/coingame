CREATE TABLE `listing_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`buyerId` int NOT NULL,
	`sellerId` int NOT NULL,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_threads_id` PRIMARY KEY(`id`),
	CONSTRAINT `listing_threads_listing_buyer_unique` UNIQUE(`listingId`,`buyerId`)
);
--> statement-breakpoint
CREATE TABLE `listing_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `listing_threads_buyer_idx` ON `listing_threads` (`buyerId`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `listing_threads_seller_idx` ON `listing_threads` (`sellerId`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `listing_messages_thread_idx` ON `listing_messages` (`threadId`,`createdAt`);
