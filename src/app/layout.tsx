import type { Metadata } from "next";
import "./globals.css";
import { PublicHeader } from "@/app/components/public-header";
import { PublicFooter } from "@/app/components/public-footer";

export const metadata: Metadata = {
  title: "Slotbook — Simple scheduling. Seamless meetings.",
  description: "Effortless, conflict-free appointment scheduling for professionals and teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased font-sans">
        <PublicHeader />
        <main className="flex-1">{children}</main>
        <PublicFooter />
      </body>
    </html>
  );
}
