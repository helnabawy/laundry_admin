/**
 * Formatting with Latin digits in both locales: tickets and tables set
 * figures in the numbering-machine face, and UAE staff read Western digits in
 * Arabic UI every day. Time zone is always the laundry's (Asia/Dubai).
 */

export const TIME_ZONE = "Asia/Dubai";

const tag = (locale: string) => `${locale === "ar" ? "ar-AE" : "en-AE"}-u-nu-latn`;

export function money(locale: string, amount: number): string {
  return new Intl.NumberFormat(tag(locale), {
    style: "currency",
    currency: "AED",
    currencyDisplay: locale === "ar" ? "symbol" : "code",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function num(locale: string, value: number, digits = 0): string {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits }).format(value);
}

export function dateTime(
  locale: string,
  value: string | Date,
  style: "date" | "time" | "dateTime" | "dayTime" | "short" = "dateTime",
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const opts: Intl.DateTimeFormatOptions = { timeZone: TIME_ZONE };
  switch (style) {
    case "date":
      Object.assign(opts, { day: "numeric", month: "short", year: "numeric" });
      break;
    case "time":
      Object.assign(opts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      break;
    case "dayTime":
      Object.assign(opts, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      break;
    case "short":
      Object.assign(opts, { day: "numeric", month: "short" });
      break;
    default:
      Object.assign(opts, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  return new Intl.DateTimeFormat(tag(locale), opts).format(d);
}

/** Day and time range separately, so the range can stay LTR and unbroken. */
export function slotWindowParts(locale: string, start: string | Date, end: string | Date) {
  const day = new Intl.DateTimeFormat(tag(locale), {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(start));
  const t = (v: string | Date) =>
    new Intl.DateTimeFormat(tag(locale), { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(v),
    );
  return { day, times: `${t(start)}–${t(end)}` };
}

/** "Tue 30 Sep · 09:00–11:00" */
export function slotWindow(locale: string, start: string | Date, end: string | Date): string {
  const day = new Intl.DateTimeFormat(tag(locale), {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(start));
  const t = (v: string | Date) =>
    new Intl.DateTimeFormat(tag(locale), { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(v),
    );
  return `${day} · ${t(start)}–${t(end)}`;
}

/**
 * Elapsed time split for a compact, localized label (`common.duration.*`):
 * "12m", "3h 05m", "2d 4h".
 */
export function elapsedParts(ms: number):
  | { key: "minutes"; values: { m: number } }
  | { key: "hours"; values: { h: number; m: string } }
  | { key: "days"; values: { d: number; h: number } } {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return { key: "minutes", values: { m: minutes } };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { key: "hours", values: { h: hours, m: String(minutes % 60).padStart(2, "0") } };
  return { key: "days", values: { d: Math.floor(hours / 24), h: hours % 24 } };
}

export function pick(locale: string, en: string, ar: string): string {
  return locale === "ar" ? ar || en : en || ar;
}

/**
 * Wraps a name in Unicode first-strong isolates so an Arabic name inside an
 * English sentence (or the reverse) keeps its own word order.
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`;
}
