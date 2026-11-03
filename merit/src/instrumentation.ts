export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // No background jobs while building (no database to talk to).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MERIT_DISABLE_JOBS === "1") {
    // Tests/CI only: in production the session sweeper must always run.
    if (process.env.NODE_ENV !== "production") return;
    console.warn("MERIT_DISABLE_JOBS production ortamında yoksayıldı");
  }

  // Dynamic imports: the edge bundle must never pull in pg. The listener goes first and each
  // step is isolated, so a pg-boss failure cannot keep realtime from starting (and vice versa).
  try {
    const { startRealtimeListener } = await import("@/lib/realtime");
    await startRealtimeListener();
  } catch (err) {
    console.error("[instrumentation] gerçek zaman dinleyicisi başlatılamadı", err);
  }
  try {
    const { startPushDispatcher } = await import("@/modules/core/server/pushDispatcher");
    startPushDispatcher();
  } catch (err) {
    console.error("[instrumentation] push dağıtıcısı başlatılamadı", err);
  }
  try {
    const { getBoss, registerJobs } = await import("@/lib/jobs");
    await registerJobs(await getBoss());
  } catch (err) {
    console.error("[instrumentation] işler başlatılamadı", err);
  }
}
