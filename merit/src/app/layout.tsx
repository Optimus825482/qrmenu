import type { Metadata, Viewport } from "next";
import { APP_THEME_COLOR } from "@/shell/appearance";
import { PwaRegister } from "@/shell/components/PwaRegister";
import { EnvLabelProvider } from "@/components/EnvLabel";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "F&B Command Center — Merit Royal",
  description: "Merit Royal F&B Command Center Otel Operasyon Platformu",
  // app/manifest.ts adds <link rel="manifest">; iOS and modern browsers read icons from here.
  icons: {
    icon: [
      { url: "/icons/merit-192.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/icons/merit-512.png?v=4", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico?v=4", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=4",
    apple: { url: "/icons/merit-192.png?v=4", sizes: "192x192", type: "image/png" },
  },
  appleWebApp: { capable: true, title: "F&B Command Center", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: APP_THEME_COLOR,
  // Lets the PWA draw under the OS bars; the footer band and mobile tab bar pad env(safe-area-inset-bottom).
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <EnvLabelProvider label={env.ENV_LABEL}>
          <PwaRegister />
          {children}
        </EnvLabelProvider>
      </body>
    </html>
  );
}
