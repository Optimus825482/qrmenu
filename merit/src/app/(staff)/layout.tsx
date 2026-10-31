export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
