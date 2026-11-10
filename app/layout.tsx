import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

// Jersey/athletic display face for headings and numerals.
const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

// Clean body sans.
const sans = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

// Scoreboard LED digits for countdowns.
const led = Share_Tech_Mono({
  variable: "--font-led",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Comet Arena", template: "%s | Comet Arena" },
  description:
    "Never miss a UTD competition, and never compete alone. Every case comp, hackathon, pitch, research, design and speaking competition at UT Dallas in one place.",
};

export const viewport: Viewport = {
  themeColor: "#10372a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${led.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
