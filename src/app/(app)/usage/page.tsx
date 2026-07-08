import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, MODEL_SLUGS, MODELS } from "@/lib/models/registry";
import { getUsageSummary } from "@/lib/usage";

export const metadata = { title: "Usage — Peakfinity Studio" };

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

function modelLabel(genModel: string): string {
  const slug = MODEL_SLUGS.find((s) => MODELS[s].genModel === genModel);
  return slug ? MODELS[slug].label : genModel;
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period = "30" } = await searchParams;
  const days = period === "all" ? null : Number(period) || 30;
  const summary = await getUsageSummary(days);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="label-mono mb-2">Usage</p>
          <h1 className="text-display text-3xl">Spend & activity</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Estimated fal spend per model and per editor.
          </p>
        </div>
        <nav className="ml-auto flex gap-1 rounded-lg border p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/usage?period=${p.value}`}
              className={`rounded-md px-3 py-1 text-sm ${
                period === p.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="label-mono font-normal">Total estimated spend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display text-4xl tabular-nums">{formatCents(summary.totalCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="label-mono font-normal">Completed generations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display text-4xl tabular-nums">{summary.eventCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-display text-lg">By model</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Generations</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byModel.map((row) => (
                    <TableRow key={row.model}>
                      <TableCell>{modelLabel(row.model)}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCents(row.costCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-display text-lg">By editor</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Editor</TableHead>
                    <TableHead className="text-right">Generations</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byUser.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCents(row.costCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Costs are estimates from the model registry&apos;s rates at generation time — reconcile
        against the fal dashboard for billing-grade numbers.
      </p>
    </div>
  );
}
