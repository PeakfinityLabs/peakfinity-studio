import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { OMNI_ENDPOINT, omniGenerateSchema, OMNI_CENTS_PER_SECOND } from "@/lib/omni";
import { findOwnProject, visibleAvatarsWhere } from "@/lib/omni-server";
import { submitJob, toAspect, type OmnirouterInput } from "@/lib/omnirouter";
import { fal, falWebhookUrl } from "@/lib/fal/client";
import { falErrorMessage } from "@/lib/fal/errors";
import { FAL_OMNI_CENTS_PER_SECOND, falOmni, type OmniFalRequest } from "@/lib/server2";
import { MAX_SOURCE_VIDEO_SECONDS } from "@/lib/omni";
import { publicVideoWindow } from "@/lib/omni-video";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Omni Flash 1.1 generation (via omnirouter). Mode → provider input:
 *   create  → prompt + reference_image_urls (avatars as data: URIs + ingredients)
 *   animate → start_image_url
 *   edit    → reference_video_url (last ≤10s of the uploaded MP4)
 *   extend  → reference_video_url (last ≤10s of the timeline clip)
 * Saved as an OMNI_FLASH job; results land via polling (refreshOmnirouterJob).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await apiGuard();
  if (me instanceof NextResponse) return me;

  // Same per-user budget as the studio's generate route.
  const limit = checkRateLimit(`generate:${me.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Rate limit reached — try again in ${limit.retryAfterSeconds}s` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  const project = await findOwnProject(me, id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const parsed = omniGenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { avatar_ids, source_clip_id, ...rest } = parsed.data;

  // Only avatars this user can see (shared, or their own private ones).
  const avatars = avatar_ids.length
    ? await prisma.avatar.findMany({
        where: { id: { in: avatar_ids }, ...visibleAvatarsWhere(me) },
        select: { id: true, name: true, imageData: true, imageType: true },
      })
    : [];
  if (avatars.length !== new Set(avatar_ids).size) {
    return NextResponse.json(
      { error: "One of the avatars is no longer available" },
      { status: 404 }
    );
  }

  let sourceClip: { id: string; url: string; trimStart: number; trimEnd: number | null } | null =
    null;
  if (rest.mode === "extend") {
    sourceClip = await prisma.omniClip.findFirst({
      where: { id: source_clip_id, projectId: id },
      select: { id: true, url: true, trimStart: true, trimEnd: true },
    });
    if (!sourceClip)
      return NextResponse.json({ error: "Clip not found in this project" }, { status: 404 });
  }

  // Only the inputs the chosen mode uses are kept.
  const modeParams: Record<string, unknown> = {
    prompt: rest.prompt,
    aspect_ratio: rest.aspect_ratio,
    duration: rest.duration,
    resolution: rest.resolution,
    server: rest.server,
    ...(rest.mode === "create" || rest.mode === "edit" ? { image_urls: rest.image_urls } : {}),
    ...(rest.mode === "animate" ? { image_url: rest.image_url } : {}),
    ...(rest.mode === "edit" ? { video_url: rest.video_url } : {}),
    ...(sourceClip ? { video_url: sourceClip.url } : {}),
  };

  const inputUrls = [
    ...(rest.mode === "create" || rest.mode === "edit" ? rest.image_urls : []),
    ...(typeof modeParams.image_url === "string" ? [modeParams.image_url] : []),
    ...(typeof modeParams.video_url === "string" ? [modeParams.video_url] : []),
  ];

  // Build the provider request for this mode.
  const base = {
    prompt: rest.prompt,
    aspect_ratio: toAspect(rest.aspect_ratio),
  };
  let providerInput: OmnirouterInput;
  // Server 2 = the same Omni Flash 1.1 on fal (built alongside, used if picked).
  let falReq: OmniFalRequest;
  // Seconds of video this job produces — drives the $0.02/s cost and usage seconds.
  let seconds = Number(rest.duration);
  try {
    if (rest.mode === "create") {
      // Avatar images live in our DB behind auth, so send them inline.
      const avatarRefs = avatars.map(
        (a) => `data:${a.imageType};base64,${Buffer.from(a.imageData).toString("base64")}`
      );
      const refs = [...avatarRefs, ...rest.image_urls];
      falReq = { mode: "create", prompt: rest.prompt, aspect: rest.aspect_ratio, seconds, images: refs };
      providerInput = {
        ...base,
        duration_sec: Number(rest.duration),
        ...(refs.length ? { reference_image_urls: refs } : {}),
      };
    } else if (rest.mode === "animate") {
      falReq = { mode: "animate", prompt: rest.prompt, aspect: rest.aspect_ratio, seconds, image: rest.image_url! };
      providerInput = {
        ...base,
        duration_sec: Number(rest.duration),
        start_image_url: rest.image_url,
      };
    } else {
      // edit / extend: the provider fetches an https MP4 and works on a ≤10s window.
      const window = await publicVideoWindow(
        rest.mode === "edit" ? { url: rest.video_url!, trimStart: 0, trimEnd: null } : sourceClip!,
        MAX_SOURCE_VIDEO_SECONDS,
        project.aspectRatio
      );
      seconds = Math.max(1, Math.round(window.trimEnd - window.trimStart));
      // fal Extend adds a new continuation (3–10s) rather than re-rendering the window.
      falReq =
        rest.mode === "edit"
          ? { mode: "edit", prompt: rest.prompt, video: window.url }
          : { mode: "extend", prompt: rest.prompt, video: window.url, seconds: Number(rest.duration) };
      providerInput = {
        ...base,
        reference_video_url: window.url,
        trim_start_sec: window.trimStart,
        trim_end_sec: window.trimEnd,
      };
    }
  } catch (error) {
    // Storage/ffmpeg errors can have empty messages — always say what failed.
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    return NextResponse.json(
      { error: `Couldn't prepare the source video for Omni${detail}` },
      { status: 400 }
    );
  }

  let remoteId: string;
  let endpoint = OMNI_ENDPOINT;
  let centsPerSecond = OMNI_CENTS_PER_SECOND;
  try {
    if (rest.server === "2") {
      const req2 = falOmni(falReq!);
      if (req2.input.duration) seconds = Number(req2.input.duration);
      endpoint = req2.endpoint;
      centsPerSecond = FAL_OMNI_CENTS_PER_SECOND;
      remoteId = (await fal.queue.submit(endpoint, { input: req2.input, webhookUrl: falWebhookUrl() })).request_id;
    } else {
      remoteId = (await submitJob("omni-flash", providerInput)).id;
    }
  } catch (error) {
    const message =
      rest.server === "2" ? falErrorMessage(error) : error instanceof Error ? error.message : "submission failed";
    return NextResponse.json(
      { error: `Omni Flash rejected the request: ${message}` },
      { status: 502 }
    );
  }

  const job = await prisma.job.create({
    data: {
      userId: me.id,
      model: "OMNI_FLASH",
      type: "VIDEO",
      status: "IN_QUEUE",
      falRequestId: remoteId,
      input: {
        endpoint,
        params: { ...modeParams, duration: String(seconds) },
        mode: rest.mode,
        projectId: id,
        projectName: project.name,
        avatars: avatars.map((a) => ({ id: a.id, name: a.name })),
        ...(sourceClip ? { sourceClipId: sourceClip.id } : {}),
      } as Prisma.InputJsonValue,
      prompt: rest.prompt,
      estimatedCostCents: seconds * centsPerSecond,
      assets: {
        create: inputUrls.map((url) => ({
          kind: "INPUT" as const,
          url,
          contentType: "application/octet-stream",
        })),
      },
    },
  });
  await prisma.omniProject.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
