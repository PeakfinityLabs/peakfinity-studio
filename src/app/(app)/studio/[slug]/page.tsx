import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateForm } from "@/components/studio/generate-form";
import { ModelGlyph } from "@/components/studio/model-glyph";
import { isModelSlug, MODELS } from "@/lib/models/registry";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseJobInput } from "@/lib/jobs/types";
import { parseVoicePlan, type VoicePlan } from "@/lib/voice/revoice";

export default async function ModelStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rerun?: string }>;
}) {
  const { slug } = await params;
  const { rerun } = await searchParams;
  if (!isModelSlug(slug)) notFound();
  const def = MODELS[slug];

  // "Re-run with same settings": seed the form from a previous job. Same
  // visibility rule as the jobs API — non-admins may only re-run their own.
  let initialParams: Record<string, unknown> | undefined;
  let initialVoice: VoicePlan | null = null;
  if (rerun) {
    const me = await getSessionUser();
    const job = await prisma.job.findUnique({ where: { id: rerun } });
    if (
      job &&
      job.model === def.genModel &&
      me &&
      (me.role === "ADMIN" || job.userId === me.id)
    ) {
      initialParams = parseJobInput(job.input).params;
      initialVoice = parseVoicePlan(job.input);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <ModelGlyph slug={slug} className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="label-mono mb-1.5">{def.type === "VIDEO" ? "Video model" : "Image model"}</p>
          <h1 className="text-display text-2xl">{def.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{def.tagline}</p>
        </div>
        <Link
          href="/studio"
          className="ml-auto shrink-0 rounded-full border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All models
        </Link>
      </div>
      <GenerateForm slug={slug} initialParams={initialParams} initialVoice={initialVoice} />
    </div>
  );
}
