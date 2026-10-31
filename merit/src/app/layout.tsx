import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merit OS",
  description: "Merit otelleri operasyon platformu",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
