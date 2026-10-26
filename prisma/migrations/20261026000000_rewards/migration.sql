-- CreateEnum
CREATE TYPE "BonusKind" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');

-- CreateTable
CREATE TABLE "SheetCreative" (
    "key" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "editorName" TEXT,
    "status" TEXT NOT NULL,
    "preexisting" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetCreative_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "EditorAlias" (
    "sheetName" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "EditorAlias_pkey" PRIMARY KEY ("sheetName")
);

-- CreateTable
CREATE TABLE "RewardsSync" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "baselineAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RewardsSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusAward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BonusKind" NOT NULL,
    "period" TEXT NOT NULL,
    "approvals" INTEGER NOT NULL,
    "cashCents" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'item',
    "costPoints" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "costPoints" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SheetCreative_approvedAt_idx" ON "SheetCreative"("approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BonusAward_userId_kind_period_key" ON "BonusAward"("userId", "kind", "period");

-- CreateIndex
CREATE INDEX "PointsEntry_userId_createdAt_idx" ON "PointsEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EditorAlias" ADD CONSTRAINT "EditorAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusAward" ADD CONSTRAINT "BonusAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "RewardItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEntry" ADD CONSTRAINT "PointsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Nicu in the sheet is Lance Concepcion in Studio.
INSERT INTO "EditorAlias" ("sheetName", "userId")
SELECT 'nicu', id FROM "User" WHERE lower(email) = 'lance16william@gmail.com'
ON CONFLICT ("sheetName") DO NOTHING;
