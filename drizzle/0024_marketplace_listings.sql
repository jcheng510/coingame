CREATE TABLE `listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`price` decimal(10,2) NOT NULL,
	`isFirmOnPrice` boolean NOT NULL DEFAULT false,
	`category` varchar(64) NOT NULL,
	`subcategory` varchar(64),
	`condition` enum('new','like_new','good','fair','poor') NOT NULL,
	`description` text,
	`locationLabel` varchar(255),
	`locationLat` decimal(10,7),
	`locationLng` decimal(10,7),
	`status` enum('draft','active','sold','removed') NOT NULL DEFAULT 'active',
	`viewCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listing_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listingId` int NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `listings_seller_status_idx` ON `listings` (`sellerId`,`status`);--> statement-breakpoint
CREATE INDEX `listings_category_status_idx` ON `listings` (`category`,`status`);--> statement-breakpoint
CREATE INDEX `listing_photos_listing_idx` ON `listing_photos` (`listingId`);
