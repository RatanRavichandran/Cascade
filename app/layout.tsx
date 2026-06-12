import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cascade — Repo Artifact Mapper",
  description:
    "Classify a GitHub repository into artifact buckets and build a knowledge graph for change-impact analysis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
