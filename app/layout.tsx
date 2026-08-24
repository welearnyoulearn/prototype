import type { Metadata } from "next";
import "./globals.css";
import OfflineBanner from "./components/OfflineBanner";
import { Toaster } from "@/components/ui/sonner";

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
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased" suppressHydrationWarning>
        <OfflineBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
