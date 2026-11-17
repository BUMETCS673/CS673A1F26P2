/*
 * AI-ASSISTED
 * Tool: OpenAI Codex; GitHub Copilot
 * Model: Exact model not recorded
 * Prompt Summary: Set the page title and description for the all-stations journey planner.
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
  title: "MBTA | All-stations journey planner",
  description:
    "Search all subway, Mattapan, and Silver Line stations and plan direct or transfer journeys with MBTA predictions and service alerts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
