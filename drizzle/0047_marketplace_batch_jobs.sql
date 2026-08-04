CREATE TABLE `marketplaceBatchJobs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL DEFAULT 1,
  `channelListingId` int NOT NULL,
  `marketplace` varchar(50) NOT NULL,
  `batchRequestId` varchar(255) NOT NULL UNIQUE,
  `status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completedAt` timestamp,

  KEY `marketplaceBatchJobs_listing_status_idx` (`channelListingId`, `status`),
  KEY `marketplaceBatchJobs_batchRequestId_idx` (`batchRequestId`),
  KEY `marketplaceBatchJobs_created_status_idx` (`createdAt`, `status`),
  KEY `marketplaceBatchJobs_listing_created_idx` (`channelListingId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
