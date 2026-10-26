import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/server/action";

export function FormMessage({ state }: { state: ActionResult }) {
  if (!state) return null;
  if (state.ok && state.message)
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 animate-fade-in">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  if (!state.ok && state.error)
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 animate-fade-in">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.error}
      </p>
    );
  return null;
}
