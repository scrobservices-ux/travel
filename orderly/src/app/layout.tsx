import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/i18n/client";
import { getLocale } from "@/i18n/server";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Orderly — Votre administratif en pilote automatique",
  description:
    "Orderly intègre des agents IA dans votre entreprise pour gérer l'administratif répétitif — facturation, comptabilité, documents et agenda — afin que vous vous concentriez sur l'essentiel.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Orderly — Votre administratif en pilote automatique",
    description:
      "Des agents IA qui gèrent la facturation, la comptabilité, les documents et l'agenda des TPE & PME.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <body className="bg-ivory text-ink antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
