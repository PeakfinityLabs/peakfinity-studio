import { getSessionUser, isAdminEmail } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getUsageSummary } from "@/lib/usage";
import { formatCents } from "@/lib/models/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminUsers } from "@/components/admin/admin-users";

export const metadata = { title: "Admin — Peakfinity Studio" };

export default async function AdminPage() {
  const me = (await getSessionUser())!;

  const [users, counts, usage] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        status: true,
        createdAt: true,
        reviewedByEmail: true,
      },
    }),
    prisma.user.groupBy({ by: ["status"], _count: true }),
    getUsageSummary(null),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  const stats = [
    { label: "Total users", value: String(users.length) },
    { label: "Pending", value: String(countByStatus["PENDING"] ?? 0) },
    { label: "Approved", value: String(countByStatus["APPROVED"] ?? 0) },
    { label: "Admins", value: String(adminCount) },
    { label: "Total spend", value: formatCents(usage.totalCents) },
    { label: "Generations", value: String(usage.eventCount) },
  ];

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    jobTitle: u.jobTitle,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    reviewedByEmail: u.reviewedByEmail,
    isSelf: u.id === me.id,
    lockedAdmin: isAdminEmail(u.email),
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="label-mono mb-2">Admin</p>
        <h1 className="text-display text-3xl">Access &amp; administration</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve new sign-ups, manage roles, and keep an eye on platform activity.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="label-mono font-normal">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-display text-2xl tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdminUsers users={rows} />
    </div>
  );
}
