"use client";

import dynamic from "next/dynamic";
import "react-photo-editor/dist/index.css";

// Dynamically import ReactPhotoEditor to prevent any SSR canvas issues
export const ReactPhotoEditor = dynamic(
  () => import("react-photo-editor").then((mod) => mod.ReactPhotoEditor),
  { ssr: false },
);
