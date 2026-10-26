"use client";
import { createContext, useCallback, useContext, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/server/action";

/** Estado "a enviar" partilhado com os botões do formulário. */
export const FormPendingContext = createContext(false);
export const useFormPendingContext = () => useContext(FormPendingContext);

type ServerFormAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/**
 * Submete um formulário para uma Server Action a partir do evento onSubmit (padrão "event handler"),
 * sem o reset automático do React 19 — o que o utilizador escreveu mantém-se quando há erros —
 * e com proteção contra submissões repetidas.
 */
export function useServerForm(action: ServerFormAction, confirmMessage?: string) {
  const [state, setState] = useState<ActionResult>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const stateRef = useRef<ActionResult>(null);
  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (inFlight.current) return;
      if (confirmMessage && !window.confirm(confirmMessage)) return;
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      const fd = new FormData(e.currentTarget, submitter && e.currentTarget.contains(submitter) ? submitter : undefined);
      inFlight.current = true;
      startTransition(async () => {
        try {
          const r = await action(stateRef.current, fd);
          stateRef.current = r;
          setState(r);
        } catch (err) {
          // Redirecionamentos (redirect()) são tratados pelo router do Next.js.
          if (err && typeof err === "object" && "digest" in err && String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw err;
          setState({ ok: false, error: "Falha de ligação. Verifique a internet e tente novamente." });
        } finally {
          inFlight.current = false;
        }
      });
    },
    [action, confirmMessage],
  );
  return { state, pending, onSubmit };
}
