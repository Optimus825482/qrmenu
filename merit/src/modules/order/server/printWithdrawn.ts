// A queued ticket of a cancelled order is closed as HATA with this note (the status enum has no "withdrawn").
// It is not a printing fault: counters and alerts about failed print jobs leave such rows out.

export const PRINT_WITHDRAWN_ERROR = "Sipariş iptal edildi";

/** Prisma filter for "not a withdrawn ticket" (`error` is nullable, so a plain `not` would drop the null rows). */
export const NOT_WITHDRAWN = { OR: [{ error: null }, { error: { not: PRINT_WITHDRAWN_ERROR } }] };

export function isWithdrawnTicket(job: { status: string; error?: string | null }): boolean {
  return job.status === "HATA" && job.error === PRINT_WITHDRAWN_ERROR;
}
