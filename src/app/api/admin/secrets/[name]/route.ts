import { NextResponse } from "next/server";
import { apiGuard } from "@/lib/authz";
import { clearSecret, isSecretName } from "@/lib/secrets";

export const runtime = "nodejs";

/** Removes a secret's DB override, reverting to the env value. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const me = await apiGuard({ requireAdmin: true });
  if (me instanceof NextResponse) return me;

  const { name } = await params;
  if (!isSecretName(name)) {
    return NextResponse.json({ error: "Unknown secret" }, { status: 400 });
  }
  await clearSecret(name);
  return NextResponse.json({ ok: true });
}
