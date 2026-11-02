-- CreateTable
CREATE TABLE "OmniTopUp" (
    "id" TEXT NOT NULL,
    "server" TEXT NOT NULL DEFAULT '1',
    "amountCents" INTEGER NOT NULL,
    "toppedUpAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmniTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OmniTopUp_server_toppedUpAt_idx" ON "OmniTopUp"("server", "toppedUpAt");
