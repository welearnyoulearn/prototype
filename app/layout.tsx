import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLearnUlearn – School Management Platform",
  description: "Multi-tenant school management and learning platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
