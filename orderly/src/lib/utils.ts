import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an integer number of cents as a currency string (defaults: EUR / France). */
export function formatMoney(cents: number, currency = "EUR", locale = "fr-FR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatDate(value: string | Date, locale = "fr-FR") {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** Format a basis-points VAT rate as a percentage label, e.g. 2000 -> "20 %". */
export function formatRate(bps: number) {
  return `${(bps / 100).toLocaleString("fr-FR")} %`;
}
