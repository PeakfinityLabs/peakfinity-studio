import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODEL_SLUGS, MODELS } from "@/lib/models/registry";

export const metadata = { title: "Studio — Peakfinity Studio" };

export default function StudioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a model to start generating.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MODEL_SLUGS.map((slug) => {
          const def = MODELS[slug];
          return (
            <Link key={slug} href={`/studio/${slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-foreground/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{def.label}</CardTitle>
                    <Badge variant={def.type === "VIDEO" ? "default" : "secondary"}>
                      {def.type === "VIDEO" ? "video" : "image"}
                    </Badge>
                  </div>
                  <CardDescription>{def.tagline}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{def.costNote}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
