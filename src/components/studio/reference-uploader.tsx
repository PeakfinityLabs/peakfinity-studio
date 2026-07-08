"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploaderDef } from "@/lib/models/registry";

type UploadedFile = { name: string; url: string; contentType: string };

export function ReferenceUploader({
  def,
  urls,
  onChange,
}: {
  def: UploaderDef;
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = useCallback(
    async (selected: File[]) => {
      if (selected.length === 0) return;
      const room = def.max - urls.length;
      if (selected.length > room) {
        toast.error(`At most ${def.max} file${def.max === 1 ? "" : "s"} for ${def.label}`);
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        for (const file of selected) formData.append("files", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        const uploaded = data.files as UploadedFile[];
        setFiles((prev) => [...prev, ...uploaded]);
        onChange([...urls, ...uploaded.map((f) => f.url)]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [def.label, def.max, onChange, urls]
  );

  const removeAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    onChange(urls.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {def.label}
        {def.required ? <span className="text-destructive"> *</span> : null}
      </p>
      <div
        className={cn(
          "flex min-h-20 cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors",
          dragging && "border-primary bg-primary/5"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        {urls.length === 0 && (
          <span>{uploading ? "Uploading…" : "Drop files or click to browse"}</span>
        )}
        {urls.map((url, index) => {
          const file = files[index];
          const isImage = file?.contentType.startsWith("image/") ?? def.accept.startsWith("image");
          return (
            <div
              key={`${url}-${index}`}
              className="group relative overflow-hidden rounded-md border bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={file?.name ?? "reference"} className="h-16 w-16 object-cover" />
              ) : (
                <div className="flex h-16 w-24 items-center justify-center px-1 text-center text-xs">
                  {file?.name ?? url.split("/").pop()}
                </div>
              )}
              <button
                type="button"
                aria-label="Remove"
                className="absolute top-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-background/90 text-xs leading-none group-hover:flex"
                onClick={() => removeAt(index)}
              >
                ×
              </button>
              {!def.single && (
                <span className="absolute bottom-0 left-0 rounded-tr bg-background/80 px-1 text-[10px]">
                  {index + 1}
                </span>
              )}
            </div>
          );
        })}
        {uploading && urls.length > 0 && <span>Uploading…</span>}
      </div>
      {def.help ? <p className="text-xs text-muted-foreground">{def.help}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={def.accept}
        multiple={!def.single}
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {urls.length > 0 && (
        <Button type="button" variant="ghost" size="xs" onClick={() => { setFiles([]); onChange([]); }}>
          Clear {def.single ? "" : `(${urls.length})`}
        </Button>
      )}
    </div>
  );
}
