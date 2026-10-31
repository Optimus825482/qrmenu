import { requireUser, type Ctx } from "@/lib/auth";
import { assertCan, type Action } from "@/lib/rbac";
import { DomainError } from "@/lib/result";

/** The signed-in user, or null when there is no valid session (the page redirects to /giris). */
export async function currentUser(): Promise<Ctx | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
    throw error;
  }
}

/**
 * assertCan for pages: false on FORBIDDEN (assertCan has already written the YETKISIZ_DENEME audit
 * row), so the caller can redirect. Kept apart from redirect(): redirect throws, and must not be
 * caught here.
 */
export async function permits(ctx: Ctx, screenCode: string, action: Action): Promise<boolean> {
  try {
    await assertCan(ctx, screenCode, action);
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") return false;
    throw error;
  }
}
