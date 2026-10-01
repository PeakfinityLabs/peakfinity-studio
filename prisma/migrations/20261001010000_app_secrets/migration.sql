-- Admin-managed, encrypted API keys that override env vars at runtime.
CREATE TABLE "AppSecret" (
    "name" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "updatedByEmail" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSecret_pkey" PRIMARY KEY ("name")
);
