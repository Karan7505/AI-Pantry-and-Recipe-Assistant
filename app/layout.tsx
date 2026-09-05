import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "Pantry — AI Recipe Assistant",
    template: "%s · Pantry",
  },
  description:
    "Photograph your fridge or pantry, get ingredient detection, recipe recommendations, grocery lists, and nutrition.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-app min-h-[100dvh] font-sans">{children}</body>
    </html>
  );
}
