import { NextResponse } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/authz";
import { getSecretStatuses, isSecretName, setSecret } from "@/lib/secrets";

export const runtime = "nodejs";

/** Masked status for every managed secret. Never returns raw values. */
export async function GET() {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;
  return NextResponse.json({ secrets: await getSecretStatuses() });
}

const setSchema = z.object({
  name: z.string(),
  value: z.string().trim().min(8, "That key looks too short.").max(500),
});

/** Sets (encrypts + stores) a managed secret, overriding its env value. */
export async function POST(req: Request) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = setSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (!isSecretName(parsed.data.name)) {
    return NextResponse.json({ error: "Unknown secret" }, { status: 400 });
  }

  await setSecret(parsed.data.name, parsed.data.value, me.email);
  return NextResponse.json({ ok: true });
}
