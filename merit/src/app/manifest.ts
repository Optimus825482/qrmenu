import type { MetadataRoute } from "next";
import { buildManifest } from "@/shell/manifests";

/** Web app manifest, served at /manifest.webmanifest ("Uygulama olarak yükle"). */
export default function manifest(): MetadataRoute.Manifest {
  return buildManifest("admin");
}
