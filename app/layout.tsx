import type { Metadata } from "next";
import React from "react";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";

export const metadata: Metadata = {
  title: "Tool Vault",
  description: "A private, calm knowledge base for tracking and learning software tools.",
  icons: {
    icon: '/gnometoolvault.png',
    shortcut: '/gnometoolvault.png',
    apple: '/gnometoolvault.png'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-black text-gray-200">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
