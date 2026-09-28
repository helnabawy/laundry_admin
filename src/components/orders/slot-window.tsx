import { useLocale } from "next-intl";
import { slotWindowParts } from "@/lib/format";

/** "Tue 30 Sep · 09:00–11:00", with the time range kept left-to-right and whole. */
export function SlotWindow({ start, end }: { start: string | Date; end: string | Date }) {
  const locale = useLocale();
  const { day, times } = slotWindowParts(locale, start, end);
  // The separator travels with the time range, so when the range wraps it
  // leads its own line instead of dangling after the date.
  const rtl = locale === "ar";
  return (
    <>
      {day}{" "}
      <bdi dir="ltr" className="whitespace-nowrap">
        {rtl ? `${times} ·` : `· ${times}`}
      </bdi>
    </>
  );
}
