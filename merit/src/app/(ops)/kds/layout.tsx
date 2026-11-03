import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mutfak ekranı", manifest: "/pos.webmanifest?ekran=kds" };

export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
