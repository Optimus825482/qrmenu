import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mutfak ekranı" };

export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
