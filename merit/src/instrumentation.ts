export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No background jobs while building (no database to talk to).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MERIT_DISABLE_JOBS === "1") {
    // Tests/CI only: in production the session sweeper must always run.
    if (process.env.NODE_ENV !== "production") return;
    console.warn("MERIT_DISABLE_JOBS production ortamında yoksayıldı");
  }

  // Dynamic imports: the edge bundle must never pull in pg.
  const { getBoss, registerJobs } = await import("@/lib/jobs");
  await registerJobs(await getBoss());
  const { startRealtimeListener } = await import("@/lib/realtime");
  await startRealtimeListener();
}
