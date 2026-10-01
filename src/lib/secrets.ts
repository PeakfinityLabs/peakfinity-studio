import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Admin-manageable secrets. Each resolves DB-override → env fallback, so
 * existing env-based keys keep working and admins can swap values from the
 * dashboard without a redeploy. Values are encrypted at rest with a key
 * derived from AUTH_SECRET (env-only), so a DB-only leak can't expose them.
 */

export type SecretName =
  | "FAL_KEY"
  | "ANTHROPIC_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "RESEND_API_KEY";

export const SECRET_CATALOG: { name: SecretName; label: string; help: string }[] = [
  { name: "FAL_KEY", label: "fal.ai", help: "Image & video generation (Nano Banana, Kling, Seedance)" },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic (Claude)", help: "Prompt optimizer" },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs", help: "Voice cloning, import & swap" },
  { name: "RESEND_API_KEY", label: "Resend", help: "Password-reset emails (optional)" },
];

const CATALOG_NAMES = new Set(SECRET_CATALOG.map((s) => s.name));
export function isSecretName(name: string): name is SecretName {
  return CATALOG_NAMES.has(name as SecretName);
}

// ─── Encryption (AES-256-GCM, key derived from AUTH_SECRET) ──────────────────
function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to encrypt/decrypt app secrets");
  // Fixed salt is fine: AUTH_SECRET is the entropy source and never leaves env.
  return scryptSync(secret, "peakfinity-app-secrets-v1", 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ─── Resolution with a short in-memory cache ─────────────────────────────────
// Keyed per secret name; caches the resolved value (or null) so a swap in the
// dashboard takes effect within TTL without re-querying on every call.
type CacheEntry = { value: string | null; expires: number };
const cache = new Map<SecretName, CacheEntry>();
const TTL_MS = 20_000;

export function bustSecretCache(name?: SecretName): void {
  if (name) cache.delete(name);
  else cache.clear();
}

/** DB-override → env fallback. Returns undefined when neither is set. */
export async function getSecret(name: SecretName): Promise<string | undefined> {
  const cached = cache.get(name);
  if (cached && cached.expires > Date.now()) {
    return cached.value ?? process.env[name] ?? undefined;
  }
  let dbValue: string | null = null;
  try {
    const row = await prisma.appSecret.findUnique({ where: { name } });
    if (row) dbValue = decrypt(row.valueEncrypted);
  } catch {
    // DB unavailable or decrypt failed — fall back to env rather than break.
  }
  cache.set(name, { value: dbValue, expires: Date.now() + TTL_MS });
  return dbValue ?? process.env[name] ?? undefined;
}

export async function setSecret(name: SecretName, value: string, byEmail: string): Promise<void> {
  const valueEncrypted = encrypt(value);
  await prisma.appSecret.upsert({
    where: { name },
    create: { name, valueEncrypted, updatedByEmail: byEmail },
    update: { valueEncrypted, updatedByEmail: byEmail },
  });
  bustSecretCache(name);
}

/** Removes the DB override, reverting to the env value. */
export async function clearSecret(name: SecretName): Promise<void> {
  await prisma.appSecret.deleteMany({ where: { name } });
  bustSecretCache(name);
}

export type SecretStatus = {
  name: SecretName;
  label: string;
  help: string;
  source: "database" | "environment" | "unset";
  hint: string | null; // masked last-4, never the full value
  updatedByEmail: string | null;
  updatedAt: string | null;
};

/** Masked status for every catalog secret — never returns raw values. */
export async function getSecretStatuses(): Promise<SecretStatus[]> {
  const rows = await prisma.appSecret.findMany();
  const byName = new Map(rows.map((r) => [r.name, r]));
  return SECRET_CATALOG.map(({ name, label, help }) => {
    const row = byName.get(name);
    let source: SecretStatus["source"] = "unset";
    let value: string | undefined;
    if (row) {
      source = "database";
      try {
        value = decrypt(row.valueEncrypted);
      } catch {
        value = undefined;
      }
    } else if (process.env[name]) {
      source = "environment";
      value = process.env[name];
    }
    return {
      name,
      label,
      help,
      source,
      hint: value ? `…${value.slice(-4)}` : null,
      updatedByEmail: row?.updatedByEmail ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}
