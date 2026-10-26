"use client";
import { useActionState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { updateCartItemAction } from "@/app/(public)/actions";

export function QuantityStepper({ itemId, quantity }: { itemId: string; quantity: number }) {
  const [, action, pending] = useActionState(updateCartItemAction, null);
  return (
    <form action={action} className="flex items-center rounded-xl border border-line" aria-busy={pending}>
      <input type="hidden" name="itemId" value={itemId} />
      <button name="quantity" value={quantity - 1} disabled={pending} className="grid h-9 w-9 place-items-center disabled:opacity-40" aria-label={quantity === 1 ? "Remover" : "Diminuir"}>
        {quantity === 1 ? <Trash2 className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4" />}
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
      <button name="quantity" value={quantity + 1} disabled={pending || quantity >= 50} className="grid h-9 w-9 place-items-center disabled:opacity-40" aria-label="Aumentar">
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}
