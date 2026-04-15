import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "Partnership Deed Generator — OnEasy",
  description:
    "Generate professional partnership deed documents with AI-assisted form filling. Manage partners, clauses, and produce legally formatted DOCX deeds.",
  robots: "noindex, nofollow", // Private portal
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="antialiased font-body bg-navy-50 text-navy-800">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
