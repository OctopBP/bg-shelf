import type { Metadata } from "next";
import { Unbounded, Onest } from "next/font/google";
import "./globals.css";
import MswReady from "@/components/MswReady";

// Display — bold, geometric, playful. Used for the logo & headings.
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800"],
});

// Body — clean, friendly, full Cyrillic coverage.
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Полка — коллекция настольных игр",
  description:
    "Коллекция настольных игр с голосовым вводом, добавлением по фото и данными из BoardGameGeek",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${unbounded.variable} ${onest.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MswReady>{children}</MswReady>
      </body>
    </html>
  );
}
