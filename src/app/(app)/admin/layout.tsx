import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";

// The (app) shell already guarantees an APPROVED session; this adds the admin gate.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/studio");
  return <>{children}</>;
}
