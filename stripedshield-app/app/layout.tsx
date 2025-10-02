import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StripedShield - Win 68% of Stripe Disputes Automatically",
  description: "AI-powered chargeback defense system that achieves a 68% win rate. Automated dispute management for Stripe merchants.",
  keywords: "stripe, chargebacks, disputes, payment protection, fraud prevention",
  authors: [{ name: "StripedShield" }],
  openGraph: {
    title: "StripedShield - Win 68% of Stripe Disputes",
    description: "Stop losing money to chargebacks. Our AI achieves 68% win rate vs 40% industry average.",
    type: "website",
    locale: "en_US",
    url: "https://stripedshield.com",
    siteName: "StripedShield",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "StripedShield - Automated Chargeback Defense",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "StripedShield - Win 68% of Stripe Disputes",
    description: "AI-powered chargeback defense with 68% win rate",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
