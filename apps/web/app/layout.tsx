import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "./components/sidebar";

export const metadata: Metadata = {
  title: "SYNAPSE",
  description:
    "An intelligence layer for mental, emotional and decision performance.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da">
      <body>
        <div className="aurora" />
        <div className="grain" />
        <div className="shell">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
