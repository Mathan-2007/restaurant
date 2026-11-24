/*
  Warnings:

  - A unique constraint covering the columns `[occurrenceKey]` on the table `TaskAssignment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passwordResetToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[emailVerificationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phoneVerificationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `IdempotencyKey` ADD COLUMN `actorId` VARCHAR(191) NULL,
    ADD COLUMN `fingerprint` VARCHAR(191) NULL,
    ADD COLUMN `shopId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Permission` MODIFY `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `PrintJob` ADD COLUMN `claimedAt` DATETIME(3) NULL,
    ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `lastAttemptAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Printer` ADD COLUMN `bridgeKeyEncrypted` VARCHAR(191) NULL,
    ADD COLUMN `bridgeUrl` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TaskAssignment` ADD COLUMN `occurrenceKey` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TaskSchedule` ADD COLUMN `lastGeneratedAt` DATETIME(3) NULL,
    ADD COLUMN `nextOccurrenceAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `emailVerificationExpires` DATETIME(3) NULL,
    ADD COLUMN `emailVerificationToken` VARCHAR(191) NULL,
    ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockoutEnd` DATETIME(3) NULL,
    ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
    ADD COLUMN `passwordResetExpires` DATETIME(3) NULL,
    ADD COLUMN `passwordResetToken` VARCHAR(191) NULL,
    ADD COLUMN `phoneVerificationExpires` DATETIME(3) NULL,
    ADD COLUMN `phoneVerificationToken` VARCHAR(191) NULL,
    ADD COLUMN `phoneVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sequenceNumber` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `shopId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `NumberSequence` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `year` INTEGER NULL,
    `lastValue` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NumberSequence_scope_prefix_year_key`(`scope`, `prefix`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `IdempotencyKey_scope_actorId_shopId_idx` ON `IdempotencyKey`(`scope`, `actorId`, `shopId`);

-- CreateIndex
CREATE UNIQUE INDEX `TaskAssignment_occurrenceKey_key` ON `TaskAssignment`(`occurrenceKey`);

-- CreateIndex
CREATE UNIQUE INDEX `User_passwordResetToken_key` ON `User`(`passwordResetToken`);

-- CreateIndex
CREATE UNIQUE INDEX `User_emailVerificationToken_key` ON `User`(`emailVerificationToken`);

-- CreateIndex
CREATE UNIQUE INDEX `User_phoneVerificationToken_key` ON `User`(`phoneVerificationToken`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
