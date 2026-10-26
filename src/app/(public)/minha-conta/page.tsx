import Link from "next/link";
import { LogOut, Store, Bike } from "lucide-react";
import { requireUser } from "@/server/guards";
import { db } from "@/server/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { profileAction } from "./actions";
import { logoutAction } from "../actions";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/minha-conta");
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <div className="space-y-5">
      {sp.senha && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Palavra-passe redefinida com sucesso.</p>}
      <Card>
        <CardHeader title="Dados pessoais" />
        <CardBody>
          <ActionForm action={profileAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name" className="sm:col-span-2"><Input id="name" name="name" defaultValue={full.name} required autoComplete="name" /></Field>
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={full.email ?? ""} required autoComplete="email" /></Field>
            <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={full.phone?.replace(/^258/, "") ?? ""} required autoComplete="tel" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {user.restaurantMembers.length === 0 && (
          <Link href="/parceiro/registo" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand/40"><Store className="h-6 w-6 text-brand" /><span><span className="block font-semibold">Tem um restaurante?</span><span className="text-sm text-muted">Candidate-se a parceiro</span></span></Link>
        )}
        {!user.courier && (
          <Link href="/entregador/registo" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand/40"><Bike className="h-6 w-6 text-brand" /><span><span className="block font-semibold">Quer fazer entregas?</span><span className="text-sm text-muted">Candidate-se a entregador</span></span></Link>
        )}
      </div>
      <form action={logoutAction} className="md:hidden">
        <button className={buttonClass("outline", "md", "w-full text-red-600")}><LogOut className="h-4 w-4" /> Terminar sessão</button>
      </form>
    </div>
  );
}

