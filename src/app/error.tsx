"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-bold">Algo correu mal</h1>
        <p className="mt-1 text-sm text-muted">Verifique a sua ligação e tente novamente.</p>
        <Button className="mt-5" onClick={() => reset()}>Tentar novamente</Button>
      </div>
    </div>
  );
}
