import type { Metadata } from "next";

export const metadata: Metadata = { manifest: "/pos.webmanifest" };

export default function KasaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
