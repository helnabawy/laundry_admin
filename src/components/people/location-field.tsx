"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, LocateFixed, Loader2, MapPin, X } from "lucide-react";
import { formatLatLng, mapEmbedUrl, mapsUrl, parseLatLng } from "@/domain/geo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

/**
 * A laundry's map pin. Staff paste coordinates or a map link, or use this
 * device's location when they're at the laundry; the map underneath shows
 * where the pin landed so a wrong paste is obvious before saving.
 *
 * [value] is the raw text; callers parse it with `parseLatLng` on submit.
 */
export function LocationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("vendors");
  const id = useId();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const pin = parseLatLng(value);
  const unreadable = value.trim() !== "" && !pin;

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setGeoError(t("locationUnsupported"));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(formatLatLng(pos.coords));
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? t("locationDenied") : t("locationFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const note = unreadable ? (
    <p id={`${id}-note`} className="text-[13px] text-danger" role="alert">
      {t("locationUnreadable")}
    </p>
  ) : geoError ? (
    <p id={`${id}-note`} className="text-[13px] text-danger" role="alert">
      {geoError}
    </p>
  ) : (
    <p id={`${id}-note`} className="text-[13px] text-ink-3">
      {t("locationHint")}
    </p>
  );

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label htmlFor={id}>{t("location")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              setGeoError(null);
              onChange(e.target.value);
            }}
            dir="ltr"
            placeholder={t("locationPlaceholder")}
            aria-invalid={unreadable || undefined}
            aria-describedby={`${id}-note`}
            className="numerals pr-9"
            autoComplete="off"
            spellCheck={false}
          />
          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-1 top-1 grid size-8 place-items-center rounded-control text-ink-3 hover:bg-card-recessed hover:text-ink"
              aria-label={t("locationClear")}
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <Button type="button" onClick={locate} disabled={locating} className="shrink-0">
          {locating ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />}
          {t("locationHere")}
        </Button>
      </div>
      {note}

      {pin ? (
        <figure className="mt-1 overflow-hidden rounded-control border border-rule-strong bg-card-recessed">
          <iframe
            key={formatLatLng(pin)}
            src={mapEmbedUrl(pin)}
            title={t("locationMapTitle")}
            className="block h-52 w-full border-0"
            referrerPolicy="no-referrer"
          />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-3 py-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <MapPin className="size-3.5 text-ink-3" aria-hidden />
              <span className="numerals" dir="ltr">
                {formatLatLng(pin)}
              </span>
            </span>
            <a
              href={mapsUrl(pin)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-ink underline decoration-rule-strong underline-offset-2 hover:decoration-ink"
            >
              {t("locationOpen")}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
