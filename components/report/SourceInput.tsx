"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, ToggleChip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MESSAGES, firstImageFile, prepareImage, validateUrl } from "@/lib/submit/client";

export type SourceChoice = { url: string; file?: undefined } | { file: File; url?: undefined };

/**
 * Report a Game, step 1: a link or a flyer. Drag and drop, paste an image, or use the camera on a phone.
 * iPhone HEIC photos are converted to JPEG here before they are ever uploaded.
 */
export function SourceInput({
  onSubmit,
  loading = false,
}: {
  onSubmit: (choice: SourceChoice) => void;
  loading?: boolean;
}) {
  const [mode, setMode] = useState<"link" | "image">("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // Object URLs must be released to avoid leaking the image in memory.
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function choose(raw: File | null) {
    if (!raw) return;
    setError(undefined);
    setBusy(true);
    const result = await prepareImage(raw);
    setBusy(false);
    if (result.error) return setError(result.error);
    setFile(result.file);
    setMode("image");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "image") {
      if (!file) return setError(MESSAGES.empty);
      return onSubmit({ file });
    }
    const problem = validateUrl(url);
    if (problem) return setError(problem);
    setError(undefined);
    onSubmit({ url: url.trim() });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      onPaste={(e) => {
        const img = firstImageFile(e.clipboardData?.items);
        if (img) {
          e.preventDefault();
          void choose(img);
        }
      }}
    >
      <div role="group" aria-label="What are you adding?" className="flex gap-2">
        <ToggleChip selected={mode === "link"} onChange={() => setMode("link")}>
          Paste a link
        </ToggleChip>
        <ToggleChip selected={mode === "image"} onChange={() => setMode("image")}>
          Upload a flyer
        </ToggleChip>
      </div>

      {mode === "link" ? (
        <Input
          label="Link to the post or page"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.instagram.com/p/…"
          hint="An Instagram, LinkedIn or event page. You can also paste a screenshot anywhere on this page."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(undefined);
          }}
          error={error}
        />
      ) : (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void choose(firstImageFile(e.dataTransfer.files) ?? e.dataTransfer.files[0] ?? null);
            }}
            className={cn(
              "flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center",
              dragging ? "border-utd-orange bg-utd-orange/10" : "border-ink-muted",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your flyer preview" className="max-h-64 rounded-lg" />
            ) : (
              <p className="text-ink-muted">
                Drag a flyer here, paste a screenshot, or choose a file.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                {file ? "Choose a different file" : "Choose a file"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => cameraInput.current?.click()}>
                Take a photo
              </Button>
              {file && (
                <Button type="button" variant="ghost" onClick={() => setFile(null)}>
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
              className="sr-only"
              aria-label="Flyer image file"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo of the flyer"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
          </div>
          {busy && (
            <p role="status" className="text-ink-muted mt-2 text-sm">
              {MESSAGES.converting}
            </p>
          )}
          {error && (
            <p role="alert" className="text-critical mt-2 text-sm font-medium">
              {error}
            </p>
          )}
        </div>
      )}

      <Button type="submit" loading={loading || busy} className="w-full sm:w-auto">
        Read it
      </Button>
    </form>
  );
}
