-- CreateTable
CREATE TABLE "RewardsProfile" (
    "userId" TEXT NOT NULL,
    "prestige" INTEGER NOT NULL DEFAULT 0,
    "xpOffset" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardsProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "RewardsProfile" ADD CONSTRAINT "RewardsProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

