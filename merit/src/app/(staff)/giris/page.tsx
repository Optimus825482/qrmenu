export const dynamic = "force-dynamic";

import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/giris">) {
  const { next } = await searchParams;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Merit!2026";
  return <LoginForm next={safeNextPath(next) ?? undefined} devAdminPassword={adminPassword} />;
}
