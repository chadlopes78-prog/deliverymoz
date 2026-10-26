/** Renderiza texto simples com títulos ("# ") e parágrafos, sem HTML (seguro contra XSS). */
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {blocks.map((b, i) =>
        b.startsWith("# ") ? (
          <h2 key={i} className={i === 0 ? "text-2xl font-bold" : "pt-2 text-lg font-semibold"}>{b.slice(2).split("\n")[0]}{b.includes("\n") && <span className="mt-2 block text-sm font-normal whitespace-pre-line">{b.split("\n").slice(1).join("\n")}</span>}</h2>
        ) : (
          <p key={i} className="whitespace-pre-line text-ink/85">{b}</p>
        ),
      )}
    </div>
  );
}
