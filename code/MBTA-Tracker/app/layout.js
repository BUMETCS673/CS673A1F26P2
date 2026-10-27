/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Set the page title and description for the Green B journey planner.
 * AI Contribution: (~90%)
 * Scope: AI-assisted page title and description changes only; excludes the existing layout and scaffold.
 * Estimate basis: Owner assessment, not measured code authorship.
 */

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "MBTA | B-branch journey planner",
  description:
    "Plan a Green Line B journey between Boston College and Government Center with MBTA predictions and service alerts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
