"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Modal acessível baseado em <dialog>. Em telemóveis aparece como folha inferior com altura limitada ao ecrã. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-2xl backdrop:animate-fade-in sm:m-auto sm:max-w-lg sm:rounded-3xl"
      aria-label={title}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col animate-slide-up">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3 pb-safe">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
