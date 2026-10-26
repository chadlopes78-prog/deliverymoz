"use client";
import { useEffect, useRef } from "react";
import type { ActionResult } from "@/server/action";
import { FormMessage } from "./form-message";
import { FormPendingContext, useServerForm } from "./form-pending";

export type FormAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Formulário ligado a uma Server Action, com mensagens de sucesso/erro e prevenção de envios repetidos. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  confirmMessage,
  hideMessage,
  id,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionResult) => void;
  confirmMessage?: string;
  hideMessage?: boolean;
  id?: string;
}) {
  const { state, pending, onSubmit } = useServerForm(action, confirmMessage);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form id={id} ref={ref} className={className} aria-busy={pending || undefined} onSubmit={onSubmit}>
      <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
      {!hideMessage && (state?.error || state?.message) ? (
        <div className="mt-3">
          <FormMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
