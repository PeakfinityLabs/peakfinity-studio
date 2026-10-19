-- Veo 3 + Omni Zone: two new studio models (API not connected yet), private
-- per-editor Omni projects with an ordered clip timeline, and named avatars.
-- AlterEnum

ALTER TYPE "GenModel" ADD VALUE 'VEO_3';
ALTER TYPE "GenModel" ADD VALUE 'OMNI_FLASH';

-- CreateTable
CREATE TABLE "OmniProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmniProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmniClip" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmniClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" BYTEA NOT NULL,
    "imageType" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OmniProject_userId_updatedAt_idx" ON "OmniProject"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "OmniClip_projectId_position_idx" ON "OmniClip"("projectId", "position");

-- CreateIndex
CREATE INDEX "Avatar_shared_createdAt_idx" ON "Avatar"("shared", "createdAt");

-- CreateIndex
CREATE INDEX "Avatar_createdById_idx" ON "Avatar"("createdById");

-- AddForeignKey
ALTER TABLE "OmniProject" ADD CONSTRAINT "OmniProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniClip" ADD CONSTRAINT "OmniClip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OmniProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

