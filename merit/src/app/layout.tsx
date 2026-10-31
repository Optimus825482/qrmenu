import type { Metadata, Viewport } from "next";
import { APP_THEME_COLOR } from "@/shell/appearance";
import { PwaRegister } from "@/shell/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Merit OS",
  description: "Merit otelleri operasyon platformu",
  // app/manifest.ts adds <link rel="manifest">; iOS reads the home-screen icon from here.
  icons: { apple: { url: "/icons/legacy/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" } },
  appleWebApp: { capable: true, title: "Merit OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
  // Lets the PWA draw under the OS bars; the footer band and mobile tab bar pad env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
