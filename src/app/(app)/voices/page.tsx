import { getSessionUser } from "@/lib/authz";
import { trackerCaps } from "@/lib/creatives";
import { VoicesView } from "@/components/voices/voices-view";

export const metadata = { title: "Voices — Peakfinity Studio" };

export default async function VoicesPage() {
  const me = (await getSessionUser())!;
  const canManage = trackerCaps(me).canEditAllFields;

  return (
    <div className="space-y-6">
      <div>
        <p className="label-mono mb-2">Voices</p>
        <h1 className="text-display text-3xl">Voice library</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {canManage
            ? "Clone and manage the voices avatars speak with. Editors pick from this list when generating videos."
            : "The voices available for talking-avatar videos. Ask an admin or strategist to add new ones."}
        </p>
      </div>
      <VoicesView />
    </div>
  );
}
