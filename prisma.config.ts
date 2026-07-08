import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js convention: secrets live in .env.local; fall back to .env (Render sets real env vars).
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Placeholder keeps URL-independent commands (generate, dev) working before .env.local exists.
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
