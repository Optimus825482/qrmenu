import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RequiredPasswordForm } from "./RequiredPasswordForm";

export default async function RequiredPasswordPage() {
  const challenge = await getSession();
  if (!challenge.userId || !challenge.pendingPasswordChange || challenge.sessionId) redirect("/giris");
  const user = await prisma.user.findUnique({ where: { id: challenge.userId }, select: { username: true, mustChangePassword: true } });
  if (!user?.mustChangePassword) redirect("/giris");
  return <RequiredPasswordForm username={user.username} />;
}
