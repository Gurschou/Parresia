import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Parresia Modeling Studio", template: "%s · Parresia Modeling" },
  description: "Advanced Behavioral Modeling: strategier, overbevisninger, værdier, meta-programmer og VAKOG fra transskripter og optagelser.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#16161f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
