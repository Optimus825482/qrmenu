import type { ReactNode } from "react";
import { requireScreen } from "@/modules/minibar/server/pageGuard";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireScreen("MB-DND");
  return children;
}
