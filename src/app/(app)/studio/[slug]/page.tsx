import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { GenerateForm } from "@/components/studio/generate-form";
import { isModelSlug, MODELS } from "@/lib/models/registry";
import { prisma } from "@/lib/db";
import { parseJobInput } from "@/lib/jobs/types";

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

  // "Re-run with same settings": seed the form from a previous job.
  let initialParams: Record<string, unknown> | undefined;
  if (rerun) {
    const job = await prisma.job.findUnique({ where: { id: rerun } });
    if (job && job.model === def.genModel) {
      initialParams = parseJobInput(job.input).params;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{def.label}</h1>
          <Badge variant={def.type === "VIDEO" ? "default" : "secondary"}>
            {def.type === "VIDEO" ? "video" : "image"}
          </Badge>
          <Link href="/studio" className="ml-auto text-sm text-muted-foreground hover:underline">
            ← All models
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{def.tagline}</p>
      </div>
      <GenerateForm slug={slug} initialParams={initialParams} />
    </div>
  );
}
