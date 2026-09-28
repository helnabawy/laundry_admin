import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

/**
 * Locale lives in a cookie (no URL prefix): the staff member's saved
 * preference, then the browser's language, then English.
 */
async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("ar") ? "ar" : DEFAULT_LOCALE;
}

export default getRequestConfig(async ({ locale: requested }) => {
  // An explicit locale (getTranslations({ locale })) wins over the viewer's.
  const locale = isLocale(requested) ? requested : await resolveLocale();
  return {
    locale,
    timeZone: "Asia/Dubai",
    // One shared "now" for the render, so server and client agree on relative times.
    now: new Date(),
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
