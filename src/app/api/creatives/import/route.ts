import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseCreativeCsv } from "@/lib/creative-csv";

export const runtime = "nodejs";

const bodySchema = z.object({
  csv: z.string().min(1, "CSV is empty").max(5_000_000),
  /** Used for rows without a Month column (Sheets tabs are per-month). */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /** false = dry run: parse and report, write nothing. */
  commit: z.boolean().default(false),
});

export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { rows, skippedBlank, missingTitleColumn } = parseCreativeCsv(
    parsed.data.csv,
    parsed.data.month
  );
  if (missingTitleColumn) {
    return NextResponse.json(
      { error: "Couldn't find a Title column — check the CSV has a header row." },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows with a title were found." }, { status: 400 });
  }

  // Link editors to app users where names match.
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));

  let created = 0;
  let duplicates = 0;

  for (const r of rows) {
    // Same key as the CLI importer: a title alone isn't unique (the sheet has
    // two distinct "Statin Side Effects" rows).
    const existing = await prisma.creative.findFirst({
      where: {
        month: r.month,
        title: r.title,
        briefLink: r.briefLink,
        editor: r.editor,
      },
      select: { id: true },
    });
    if (existing) {
      duplicates++;
      continue;
    }
    if (parsed.data.commit) {
      await prisma.creative.create({
        data: {
          ...r,
          editorUserId: r.editor ? (byName.get(r.editor.toLowerCase()) ?? null) : null,
        },
      });
    }
    created++;
  }

  return NextResponse.json({
    committed: parsed.data.commit,
    parsed: rows.length,
    created,
    duplicates,
    skippedBlank,
    months: [...new Set(rows.map((r) => r.month))].sort(),
    sample: rows.slice(0, 5).map((r) => ({
      title: r.title,
      editor: r.editor,
      status: r.status,
      month: r.month,
    })),
  });
}
