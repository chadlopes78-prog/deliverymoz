import Link from "next/link";
import type { Metadata } from "next";
import { Store, CheckCircle2 } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { getGeography } from "@/server/location";
import { getSettings } from "@/server/services/settings";
import { Logo } from "@/components/logo";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { CityNeighborhoodSelect } from "@/components/city-neighborhood";
import { applyPartnerAction } from "../actions";

export const metadata: Metadata = { title: "Registar restaurante", description: "Candidate o seu restaurante a parceiro da plataforma." };

export default async function PartnerSignup() {
  const [user, geography, settings] = await Promise.all([getSessionUser(), getGeography(), getSettings()]);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface"><div className="mx-auto flex h-16 max-w-4xl items-center px-4"><Logo /></div></header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><Store className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-bold">Registe o seu restaurante</h1>
            <p className="mt-1 text-sm text-muted">Envie a candidatura. Depois da aprovação e da configuração do cardápio, horário e zonas de entrega, começa a receber pedidos.</p>
          </div>
        </div>
        {user?.restaurantMembers.length ? <p className="mt-4 rounded-xl bg-ink/5 p-3 text-sm">Já está associado a um restaurante. <Link className="font-semibold text-brand" href="/parceiro">Abrir o painel</Link></p> : null}
        {!settings.partnerSignupOpen ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm">As candidaturas estão temporariamente fechadas.</p>
          : !user ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <ul className="space-y-2 text-sm">{["Gestão do cardápio, fotografias e preços", "Receção de pedidos com alertas em tempo real", "Relatórios financeiros e liquidações"].map((t) => <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" />{t}</li>)}</ul>
              <p className="mt-4 text-sm">Para se candidatar, entre ou crie uma conta (será a conta do proprietário).</p>
              <div className="mt-3 flex flex-wrap gap-2"><Link href="/registar?next=/parceiro/registo" className={buttonClass()}>Criar conta</Link><Link href="/entrar?next=/parceiro/registo" className={buttonClass("outline")}>Já tenho conta</Link></div>
            </div>
          ) : geography.length === 0 ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm">Ainda não existem cidades atendidas pela plataforma.</p> : (
            <ActionForm action={applyPartnerAction} className="mt-6 space-y-5">
              <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
                <h2 className="font-semibold sm:col-span-2">Restaurante</h2>
                <Field label="Nome comercial" htmlFor="name"><Input id="name" name="name" required /></Field>
                <Field label="Nome do responsável" htmlFor="responsibleName"><Input id="responsibleName" name="responsibleName" defaultValue={user.name} required /></Field>
                <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={user.phone?.replace(/^258/, "") ?? ""} required /></Field>
                <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={user.email ?? ""} required /></Field>
                <CityNeighborhoodSelect geography={geography} />
                <Field label="Endereço" htmlFor="addressLine"><Input id="addressLine" name="addressLine" required /></Field>
                <Field label="Referência" htmlFor="addressReference"><Input id="addressReference" name="addressReference" /></Field>
                <Field label="Horário de funcionamento (indicativo)" htmlFor="openingHoursNote" className="sm:col-span-2"><Input id="openingHoursNote" name="openingHoursNote" placeholder="Ex.: seg–sáb 10:00–22:00" /></Field>
              </section>
              <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
                <h2 className="font-semibold sm:col-span-2">Informações comerciais</h2>
                <Field label="Denominação social" htmlFor="legalName"><Input id="legalName" name="legalName" /></Field>
                <Field label="NUIT" htmlFor="nuit"><Input id="nuit" name="nuit" inputMode="numeric" /></Field>
                <Field label="Descrição do negócio" htmlFor="businessInfo" className="sm:col-span-2"><Textarea id="businessInfo" name="businessInfo" placeholder="Tipo de cozinha, tempo de atividade, capacidade…" /></Field>
                <Field label="Dados para liquidação" htmlFor="payoutDetails" hint="Ex.: número M-Pesa ou banco/NIB" className="sm:col-span-2"><Input id="payoutDetails" name="payoutDetails" /></Field>
              </section>
              <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3">
                <h2 className="font-semibold sm:col-span-3">Documentos (PDF, JPG ou PNG, até 6 MB — privados)</h2>
                <Field label="Alvará / licença" htmlFor="docLicense"><Input id="docLicense" name="docLicense" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
                <Field label="Certidão NUIT" htmlFor="docNuit"><Input id="docNuit" name="docNuit" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
                <Field label="Outro" htmlFor="docOther"><Input id="docOther" name="docOther" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
              </section>
              <SubmitButton size="lg" pendingText="A enviar…">Enviar candidatura</SubmitButton>
            </ActionForm>
          )}
      </div>
    </div>
  );
}
