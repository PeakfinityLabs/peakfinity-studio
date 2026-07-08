import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFalWebhookHeaders, verifyFalWebhook } from "@/lib/fal/webhook";
import { completeJob, failJob } from "@/lib/jobs/complete";

export const runtime = "nodejs";

type FalWebhookBody = {
  request_id?: string;
  gateway_request_id?: string;
  status?: "OK" | "ERROR";
  error?: string;
  payload?: unknown;
};

export async function POST(req: Request) {
  const rawBody = Buffer.from(await req.arrayBuffer());

  const verification = await verifyFalWebhook(readFalWebhookHeaders(req.headers), rawBody);
  if (!verification.valid) {
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  let body: FalWebhookBody;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestId = body.request_id;
  if (!requestId) {
    return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { falRequestId: requestId } });
  if (!job) {
    // 404 makes fal retry — covers the (unlikely) race where the webhook
    // arrives before the Job row is committed.
    return NextResponse.json({ error: "Unknown request_id" }, { status: 404 });
  }

  if (body.status === "OK") {
    await completeJob(job.id, body.payload);
  } else {
    await failJob(job.id, body.error ?? "Generation failed", body.payload);
  }

  return NextResponse.json({ ok: true });
}
