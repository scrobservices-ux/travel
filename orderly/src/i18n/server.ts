import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDictionary, type Locale } from "./dictionaries";

export const LOCALE_COOKIE = "orderly_locale";

/** The active locale for this request (cookie-driven, French by default). */
export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return value === "en" || value === "fr" ? value : DEFAULT_LOCALE;
}

/** Server-side dictionary for the active locale. */
export function getDict() {
  return getDictionary(getLocale());
}
