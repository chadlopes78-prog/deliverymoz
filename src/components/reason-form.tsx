import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

/** Ação que exige motivo (recusar, suspender, cancelar): abre um pequeno formulário inline. */
export function ReasonForm({ action, hidden, label, variant = "outline", placeholder = "Motivo", required = true, confirmMessage }: { action: FormAction; hidden: Record<string, string>; label: string; variant?: "outline" | "danger" | "primary"; placeholder?: string; required?: boolean; confirmMessage?: string }) {
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold marker:hidden">{label}</summary>
      <ActionForm action={action} className="space-y-2 border-t border-line p-3" confirmMessage={confirmMessage}>
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Textarea name="reason" required={required} placeholder={placeholder} maxLength={500} className="min-h-16" aria-label={placeholder} />
        <SubmitButton size="sm" variant={variant}>{label}</SubmitButton>
      </ActionForm>
    </details>
  );
}

/** Botão de ação simples com campos ocultos. */
export function QuickAction({ action, hidden, label, variant = "outline", confirmMessage, size = "sm" }: { action: FormAction; hidden: Record<string, string>; label: React.ReactNode; variant?: "outline" | "danger" | "primary" | "accent" | "ghost" | "secondary"; confirmMessage?: string; size?: "sm" | "md" }) {
  return (
    <ActionForm action={action} confirmMessage={confirmMessage}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton size={size} variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );
}
