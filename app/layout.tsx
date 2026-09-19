import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import OfflineBanner from "./components/OfflineBanner";
import { Toaster } from "@/components/ui/sonner";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "We Learn You Learn – School Management Platform",
  description: "Multi-tenant school management and learning platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-gray-50 antialiased" suppressHydrationWarning>
        <OfflineBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
