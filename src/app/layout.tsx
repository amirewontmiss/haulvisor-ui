// File: ~/haulvisor_project/haulvisor-ui/src/app/layout.tsx
// Or layout.js if you are using JavaScript

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Assuming you have this for global styles

const inter = Inter({ subsets: ["latin"] });

// This is the part to change:
export const metadata: Metadata = {
  title: "HaulVisor", // Changed from "Create Next App" or similar
  description: "Quantum Circuit Orchestration Interface for HaulVisor", // Optional: Add a description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

