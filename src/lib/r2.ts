import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const globalForR2 = globalThis as unknown as { r2?: S3Client };

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function r2Client(): S3Client {
  if (!globalForR2.r2) {
    globalForR2.r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return globalForR2.r2;
}

export async function uploadToR2(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getFromR2(key: string, range?: string) {
  return r2Client().send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Range: range,
    })
  );
}
