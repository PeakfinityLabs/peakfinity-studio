"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type PreviewItem = {
  url: string;
  title: string;
  subtitle?: string;
  /** Timeline clips play only their trimmed range. */
  trimStart?: number;
  trimEnd?: number | null;
  downloadHref?: string;
  onInsert?: () => void;
};

/** Large in-page player with sound — no download or insert needed to watch a clip. */
export function PreviewDialog({
  item,
  portrait,
  onClose,
}: {
  item: PreviewItem | null;
  portrait: boolean;
  onClose: () => void;
}) {
  const start = item?.trimStart ?? 0;
  const end = item?.trimEnd ?? null;

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={portrait ? "sm:max-w-md" : "sm:max-w-3xl"}>
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="line-clamp-2 pr-6 text-base">{item.title}</DialogTitle>
              {item.subtitle && <DialogDescription>{item.subtitle}</DialogDescription>}
            </DialogHeader>
            <video
              key={`${item.url}-${start}-${end}`}
              src={item.url}
              autoPlay
              controls
              playsInline
              onLoadedMetadata={(e) => {
                if (start > 0) e.currentTarget.currentTime = start;
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (end !== null && v.currentTime >= end) {
                  v.pause();
                  v.currentTime = start;
                }
              }}
              className={cn(
                "mx-auto max-h-[75vh] rounded-lg bg-black",
                portrait ? "aspect-[9/16]" : "aspect-video w-full"
              )}
            />
            {(item.onInsert || item.downloadHref) && (
              <div className="flex justify-end gap-2">
                {item.downloadHref && (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      // Cross-origin links ignore `download`, so open those in a new tab
                      // instead of navigating away from the project.
                      <a
                        href={item.downloadHref}
                        download
                        {...(item.downloadHref.startsWith("/")
                          ? {}
                          : { target: "_blank", rel: "noopener noreferrer" })}
                      >
                        Download
                      </a>
                    }
                  />
                )}
                {item.onInsert && (
                  <Button
                    size="sm"
                    onClick={() => {
                      item.onInsert?.();
                      onClose();
                    }}
                  >
                    Insert into timeline
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
