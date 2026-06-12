import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Orderly — Put your business admin on autopilot",
  description:
    "Orderly embeds AI agents in your business to handle the repetitive admin — invoicing, bookkeeping, documents and scheduling — so you can focus on the work that matters.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Orderly — Put your business admin on autopilot",
    description:
      "AI agents that handle invoicing, bookkeeping, documents and scheduling for small & medium businesses.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="bg-ivory text-ink antialiased">{children}</body>
    </html>
  );
}
