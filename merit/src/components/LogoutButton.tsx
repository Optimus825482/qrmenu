/**
 * Signs the user out. A plain POST form (no client JavaScript): GET /cikis does not exist, so a
 * link or image on another site cannot log anyone out, and the route checks the Origin header.
 */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form method="post" action="/cikis">
      <button
        type="submit"
        className={
          className ??
          "min-h-11 w-full rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      >
        Oturumu Kapat
      </button>
    </form>
  );
}
