import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DH Signature CRM",
  description: "Commercial & Operational Control Cockpit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
