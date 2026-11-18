import { THEME_INIT_SCRIPT } from "@/lib/theme";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./carbon.scss";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import MethodOverrideClient from "./MethodOverrideClient";

const prompt = IBM_Plex_Sans_Thai({
  weight: ["300", "400", "500", "600"],
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-prompt",
});

export const metadata: Metadata = {
  title: "IAMX | Identity & Access Management",
  description: "Modern identity and access management system for enterprise applications",
  keywords: ["IAM", "RBAC", "Identity Management", "Access Control"],
  authors: [{ name: "IAMX Team" }],
  icons: {
    icon: "/iamx/images/iamx-icon.svg",
    shortcut: "/iamx/images/IAM.png",
    apple: "/iamx/images/IAM.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={prompt.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${prompt.className} min-h-screen antialiased`}>
        <MethodOverrideClient />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
