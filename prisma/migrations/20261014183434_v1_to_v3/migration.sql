/*
  Warnings:

  - You are about to drop the column `paidOutAt` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `payoutError` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `payoutId` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `amountSats` on the `Tontine` table. All the data in the column will be lost.
  - Added the required column `amountXof` to the `Contribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dueAt` to the `Round` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amountXof` to the `Tontine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalRounds` to the `Tontine` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Round" DROP CONSTRAINT "Round_beneficiaryId_fkey";

-- AlterTable
ALTER TABLE "Contribution" ADD COLUMN     "amountXof" INTEGER NOT NULL,
ADD COLUMN     "creditUsedXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guaranteeXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sponsorName" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL,
ALTER COLUMN "paymentRequest" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "creditXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sponsorPhone" TEXT,
ADD COLUMN     "sponsorUserId" TEXT;

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "paidOutAt",
DROP COLUMN "payoutError",
DROP COLUMN "payoutId",
ADD COLUMN     "bidXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "feeXof" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "beneficiaryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tontine" DROP COLUMN "amountSats",
ADD COLUMN     "amountXof" INTEGER NOT NULL,
ADD COLUMN     "drawBlockHash" TEXT,
ADD COLUMN     "drawBlockHeight" INTEGER,
ADD COLUMN     "fundXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "goalLabel" TEXT,
ADD COLUMN     "guaranteeBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "latePenaltyXof" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "orderMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "orgId" TEXT,
ADD COLUMN     "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "totalRounds" INTEGER NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'ROTATING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr';

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roundId" TEXT,
    "kind" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "sats" INTEGER NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentRequest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "roundId" TEXT,
    "memberId" TEXT NOT NULL,
    "requestId" TEXT,
    "amountXof" INTEGER NOT NULL,
    "feeXof" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "error" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundEntry" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolidarityRequest" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolidarityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_userId_key" ON "OrgMember"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_roundId_memberId_kind_key" ON "Charge"("roundId", "memberId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_key_key" ON "Payout"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_requestId_key" ON "Payout"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_roundId_memberId_key" ON "Bid"("roundId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_key_key" ON "Notification"("key");

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tontine" ADD CONSTRAINT "Tontine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_sponsorUserId_fkey" FOREIGN KEY ("sponsorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SolidarityRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolidarityRequest" ADD CONSTRAINT "SolidarityRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
