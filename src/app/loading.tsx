export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-8" aria-busy="true" aria-label="A carregar">
      <div className="h-8 w-48 rounded-lg bg-ink/10" />
      <div className="h-32 rounded-2xl bg-ink/5" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-2xl bg-ink/5" /><div className="h-24 rounded-2xl bg-ink/5" /><div className="h-24 rounded-2xl bg-ink/5" />
      </div>
    </div>
  );
}
