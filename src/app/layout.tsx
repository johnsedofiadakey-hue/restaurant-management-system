import type { Metadata } from "next";
import { AuthProvider } from "../lib/authContext";
import { ToastProvider } from "../components/Toast";
import "./globals.css";

import { Inter, Outfit } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const outfit = Outfit({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Kyekye Cuisine",
  description: "Modern POS and Order Management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kyekye"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script async src="https://js.paystack.co/v1/inline.js" />
      </head>
      <body className={`${inter.variable} ${outfit.variable}`} style={{ fontFamily: "var(--font-body, system-ui)" }}>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
