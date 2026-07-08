import "server-only";
import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const TIMESTAMP_LEEWAY_SECONDS = 300;

let jwksCache: { keys: KeyObject[]; fetchedAt: number } | null = null;

async function getPublicKeys(): Promise<KeyObject[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch fal JWKS: ${res.status}`);
  const jwks = (await res.json()) as { keys?: Array<{ x?: string }> };
  const keys = (jwks.keys ?? [])
    .filter((k): k is { x: string } => typeof k.x === "string")
    .map((k) =>
      createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" })
    );
  if (keys.length === 0) throw new Error("fal JWKS contained no usable keys");
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

export type FalWebhookHeaders = {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function readFalWebhookHeaders(headers: Headers): FalWebhookHeaders {
  return {
    requestId: headers.get("x-fal-webhook-request-id"),
    userId: headers.get("x-fal-webhook-user-id"),
    timestamp: headers.get("x-fal-webhook-timestamp"),
    signature: headers.get("x-fal-webhook-signature"),
  };
}

export async function verifyFalWebhook(
  headers: FalWebhookHeaders,
  rawBody: Buffer
): Promise<{ valid: boolean; reason?: string }> {
  const { requestId, userId, timestamp, signature } = headers;
  if (!requestId || !userId || !timestamp || !signature) {
    return { valid: false, reason: "Missing webhook signature headers" };
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > TIMESTAMP_LEEWAY_SECONDS
  ) {
    return { valid: false, reason: "Webhook timestamp outside allowed window" };
  }

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join("\n"), "utf8");

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "hex");
  } catch {
    return { valid: false, reason: "Malformed signature" };
  }

  const keys = await getPublicKeys();
  for (const key of keys) {
    try {
      if (verify(null, message, key, signatureBytes)) return { valid: true };
    } catch {
      // try next key
    }
  }
  return { valid: false, reason: "Signature did not match any fal public key" };
}
