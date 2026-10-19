"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EditableClip = {
  id: string;
  label: string;
  url: string;
  trimStart: number;
  trimEnd: number | null;
};

const MIN = 0.1;
const STEP = 0.1;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Trim + cut editor for one timeline clip. Drag the in/out handles (or use
 * arrow keys / "Set in"/"Set out" at the playhead); trims save when you let
 * go. "Cut at playhead" splits the clip in two. The source file is never
 * modified — trims are just in/out points.
 */
export function ClipEditor({
  clip,
  index,
  portrait,
  busy,
  onTrim,
  onCut,
  onClose,
}: {
  clip: EditableClip;
  index: number;
  portrait: boolean;
  busy: boolean;
  onTrim: (trimStart: number, trimEnd: number | null) => void;
  onCut: (at: number) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState(clip.trimStart);
  const [end, setEnd] = useState<number | null>(clip.trimEnd);
  const [time, setTime] = useState(clip.trimStart);
  const [dragging, setDragging] = useState<"start" | "end" | "seek" | null>(null);

  // Re-sync when a different clip is opened or the server copy changes.
  useEffect(() => {
    setStart(clip.trimStart);
    setEnd(clip.trimEnd);
  }, [clip.id, clip.trimStart, clip.trimEnd]);

  const out = end ?? duration ?? 0;

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
  };

  const save = (s: number, e: number | null) => {
    // Out point at (or past) the file's end is stored as "play to end".
    const normalizedEnd = e !== null && duration !== null && e >= duration - 0.05 ? null : e;
    if (s !== clip.trimStart || normalizedEnd !== clip.trimEnd) onTrim(s, normalizedEnd);
  };

  const timeAt = (clientX: number) => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const r = bar.getBoundingClientRect();
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration;
  };

  const applyDrag = (which: "start" | "end" | "seek", t: number) => {
    if (!duration) return;
    if (which === "start") {
      const s = Math.min(Math.max(t, 0), out - MIN);
      setStart(s);
      seek(s);
    } else if (which === "end") {
      const e = Math.max(Math.min(t, duration), start + MIN);
      setEnd(e);
      seek(e);
    } else {
      seek(Math.min(Math.max(t, start), out));
    }
  };

  const onPointerDown = (which: "start" | "end" | "seek") => (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    videoRef.current?.pause();
    setDragging(which);
    applyDrag(which, timeAt(ev.clientX));
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (dragging) applyDrag(dragging, timeAt(ev.clientX));
  };
  const onPointerUp = () => {
    if (dragging === "start" || dragging === "end") save(start, end);
    setDragging(null);
  };

  const onHandleKey = (which: "start" | "end") => (ev: React.KeyboardEvent) => {
    const delta = ev.key === "ArrowLeft" ? -STEP : ev.key === "ArrowRight" ? STEP : 0;
    if (!delta || !duration) return;
    ev.preventDefault();
    if (which === "start") {
      const s = Math.min(Math.max(start + delta, 0), out - MIN);
      setStart(s);
      seek(s);
      save(s, end);
    } else {
      const e = Math.max(Math.min(out + delta, duration), start + MIN);
      setEnd(e);
      seek(e);
      save(start, e);
    }
  };

  const pct = (t: number) => (duration ? `${(t / duration) * 100}%` : "0%");
  const canCut = duration !== null && time - start >= MIN && out - time >= MIN;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          Editing clip {index + 1}: {clip.label}
        </p>
        <Button variant="ghost" size="xs" onClick={onClose}>
          Done
        </Button>
      </div>

      <video
        ref={videoRef}
        src={clip.url}
        playsInline
        controls={false}
        onClick={() => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) {
            if (v.currentTime < start || v.currentTime >= out - 0.05) v.currentTime = start;
            void v.play();
          } else v.pause();
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : null);
          e.currentTarget.currentTime = clip.trimStart;
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          // Playback stays inside the trimmed range.
          if (!v.paused && v.currentTime >= out) {
            v.pause();
            v.currentTime = out;
          }
          setTime(v.currentTime);
        }}
        className={cn(
          "mx-auto max-h-[45vh] cursor-pointer rounded-md bg-black",
          portrait ? "aspect-[9/16]" : "aspect-video w-full"
        )}
      />

      {/* Trim bar: shaded = cut away, bright = kept; white line = playhead */}
      <div
        ref={barRef}
        className="relative h-10 touch-none rounded-md bg-background select-none"
        onPointerDown={onPointerDown("seek")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {duration !== null && (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-l-md bg-foreground/10"
              style={{ width: pct(start) }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-md bg-foreground/10"
              style={{ left: pct(out) }}
            />
            <div
              className="absolute inset-y-0 border-y-2 border-foreground/80 bg-foreground/30"
              style={{ left: pct(start), width: `calc(${pct(out)} - ${pct(start)})` }}
            />
            {(["start", "end"] as const).map((which) => (
              <div
                key={which}
                role="slider"
                tabIndex={0}
                aria-label={which === "start" ? "Trim start" : "Trim end"}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration * 10) / 10}
                aria-valuenow={Math.round((which === "start" ? start : out) * 10) / 10}
                aria-valuetext={fmt(which === "start" ? start : out)}
                onPointerDown={onPointerDown(which)}
                onKeyDown={onHandleKey(which)}
                className={cn(
                  "absolute inset-y-0 z-10 w-3 cursor-ew-resize bg-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  which === "start" ? "-translate-x-full rounded-l-md" : "rounded-r-md"
                )}
                style={{ left: pct(which === "start" ? start : out) }}
              />
            ))}
            {/* Playhead drawn last so it stays visible on top of a handle */}
            <div
              className="pointer-events-none absolute -inset-y-1 z-20 w-0.5 -translate-x-1/2 bg-red-500"
              style={{ left: pct(time) }}
            >
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-500" />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">
          {duration === null
            ? "Loading…"
            : `In ${fmt(start)} · Out ${fmt(out)} · ${fmt(out - start)} kept of ${fmt(duration)} · playhead ${fmt(time)}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={busy || duration === null || time >= out - MIN}
            onClick={() => {
              setStart(time);
              save(time, end);
            }}
          >
            Set in
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy || duration === null || time <= start + MIN}
            onClick={() => {
              setEnd(time);
              save(start, time);
            }}
          >
            Set out
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy || (start === 0 && end === null)}
            onClick={() => {
              setStart(0);
              setEnd(null);
              onTrim(0, null);
            }}
          >
            Reset trim
          </Button>
          <Button size="xs" disabled={busy || !canCut} onClick={() => onCut(time)}>
            ✂ Cut at playhead
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag the white handles to trim (or focus one and use ← →). Click the bar to move the
        playhead, click the video to play the kept part. Cutting splits the clip in two so you can
        trim, move or remove each part. Trims never change the original file — reset any time.
      </p>
    </div>
  );
}
