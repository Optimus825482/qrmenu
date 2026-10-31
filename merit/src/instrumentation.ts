export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No background jobs while building or in tests (no database to talk to / no stray timers).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MERIT_DISABLE_JOBS === "1") return;

  // Dynamic import: the edge bundle must never pull in pg.
  const { getBoss, registerJobs } = await import("@/lib/jobs");
  await registerJobs(await getBoss());
  // Task 8 adds startRealtimeListener() here.
}
