/** Gráficos SVG leves (sem dependências), adequados a ligações lentas. Mostram apenas dados reais recebidos. */
export function BarChart({ data, format, height = 180, color = "var(--brand)", emptyText = "Ainda não existem dados neste período." }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number; color?: string; emptyText?: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max === 0) return <p className="grid h-40 place-items-center text-sm text-muted">{emptyText}</p>;
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Gráfico de barras">
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect key={d.label} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={0.8} fill={color} opacity={0.9}>
              <title>{`${d.label}: ${format ? format(d.value) : d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Máximo: {format ? format(max) : max}</p>
    </div>
  );
}

export function HBarList({ data, format }: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max === 0) return <p className="py-8 text-center text-sm text-muted">Ainda não existem dados neste período.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{format ? format(d.value) : d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-ink/5">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
