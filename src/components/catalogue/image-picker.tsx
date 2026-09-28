"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Photo field for a FormData form: `image` file + `removeImage` flag. */
export function ImagePicker({ current }: { current: string | null }) {
  const t = useTranslations("catalogue");
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [removed, setRemoved] = useState(false);
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-dashed border-rule-strong bg-card-recessed text-ink-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6" aria-hidden />
        )}
      </span>
      <div className="flex flex-col items-start gap-2">
        <input
          ref={input}
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPreview(URL.createObjectURL(file));
              setRemoved(false);
            }
          }}
        />
        <input type="hidden" name="removeImage" value={removed ? "1" : "0"} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <ImagePlus aria-hidden /> {t("uploadImage")}
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                setRemoved(true);
                if (input.current) input.current.value = "";
              }}
            >
              <Trash2 aria-hidden /> {t("removeImage")}
            </Button>
          ) : null}
        </div>
        <p className="text-[12.5px] text-ink-3">{t("imageHint")}</p>
      </div>
    </div>
  );
}
