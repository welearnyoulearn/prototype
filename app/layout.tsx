import type { Metadata } from "next";
import "./globals.css";
import Analytics from "./components/Analytics";

export const metadata: Metadata = {
  title: "We Learn You Learn – School Management Platform",
  description: "Multi-tenant school management and learning platform",
  // Google Search Console — omitted from the head when the env var is unset.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased" suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
