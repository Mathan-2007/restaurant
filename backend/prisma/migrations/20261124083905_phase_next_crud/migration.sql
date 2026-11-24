-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `deepLink` VARCHAR(191) NULL,
    ADD COLUMN `readAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `RestaurantTable` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `diningArea` VARCHAR(191) NOT NULL DEFAULT 'Main Hall',
    ADD COLUMN `name` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ShopSettings` ADD COLUMN `closingTime` VARCHAR(191) NULL,
    ADD COLUMN `dineInAvailable` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `openingTime` VARCHAR(191) NULL,
    ADD COLUMN `orderEndTime` VARCHAR(191) NULL,
    ADD COLUMN `orderStartTime` VARCHAR(191) NULL,
    ADD COLUMN `refundApprovalRequired` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `takeawayAvailable` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `EmployeeProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `shiftNotes` VARCHAR(191) NULL,

    UNIQUE INDEX `EmployeeProfile_userId_key`(`userId`),
    UNIQUE INDEX `EmployeeProfile_employeeCode_key`(`employeeCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Shift_shopId_startsAt_idx`(`shopId`, `startsAt`),
    INDEX `Shift_userId_startsAt_idx`(`userId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TableArea` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TableArchive` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `archivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeeProfile` ADD CONSTRAINT `EmployeeProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TableArea` ADD CONSTRAINT `TableArea_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TableArchive` ADD CONSTRAINT `TableArchive_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TableArchive` ADD CONSTRAINT `TableArchive_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `RestaurantTable`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
