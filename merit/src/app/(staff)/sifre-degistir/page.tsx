import { redirect } from "next/navigation";
import { getSession, requireUser, type Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OwnPasswordForm } from "./OwnPasswordForm";
import { RequiredPasswordForm } from "./RequiredPasswordForm";

export default async function RequiredPasswordPage() {
  const challenge = await getSession();
  // Signed in: the user changes their own password and must prove the current one.
  if (challenge.sessionId) {
    let ctx: Ctx | null = null;
    try {
      ctx = await requireUser();
    } catch {
      ctx = null;
    }
    if (!ctx) redirect("/giris");
    return <OwnPasswordForm username={ctx.user.username} />;
  }
  // Mandatory first-login change: the short-lived challenge cookie already proved the password.
  if (!challenge.userId || !challenge.pendingPasswordChange) redirect("/giris");
  const user = await prisma.user.findUnique({ where: { id: challenge.userId }, select: { username: true, mustChangePassword: true } });
  if (!user?.mustChangePassword) redirect("/giris");
  return <RequiredPasswordForm username={user.username} />;
}
