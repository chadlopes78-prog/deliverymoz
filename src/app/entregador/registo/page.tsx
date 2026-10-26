import Link from "next/link";
import type { Metadata } from "next";
import { Bike } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { getGeography } from "@/server/location";
import { getSettings } from "@/server/services/settings";
import { VEHICLE_LABEL } from "@/server/services/couriers";
import { Logo } from "@/components/logo";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { applyCourierAction } from "../actions";

export const metadata: Metadata = { title: "Ser entregador", description: "Candidate-se a entregador parceiro." };

export default async function CourierSignup() {
  const [user, geography, settings] = await Promise.all([getSessionUser(), getGeography(), getSettings()]);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface"><div className="mx-auto flex h-16 max-w-2xl items-center px-4"><Logo /></div></header>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><Bike className="h-6 w-6" /></span>
          <div><h1 className="text-2xl font-bold">Ser entregador</h1><p className="mt-1 text-sm text-muted">Faça entregas no seu horário. A conta fica pendente até verificarmos os seus documentos.</p></div>
        </div>
        {user?.courier ? <p className="mt-6 rounded-xl bg-ink/5 p-4 text-sm">Já tem uma candidatura. <Link href="/entregador" className="font-semibold text-brand">Abrir painel</Link></p>
          : !settings.courierSignupOpen ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm">As candidaturas estão temporariamente fechadas.</p>
          : !user ? (
            <div className="mt-6 flex flex-wrap gap-2"><Link href="/registar?next=/entregador/registo" className={buttonClass()}>Criar conta</Link><Link href="/entrar?next=/entregador/registo" className={buttonClass("outline")}>Já tenho conta</Link></div>
          ) : geography.length === 0 ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm">Ainda não existem cidades atendidas.</p> : (
            <ActionForm action={applyCourierAction} className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm">Nome: <strong>{user.name}</strong> · Telefone: <strong>{user.phone}</strong></p>
              <Field label="Cidade" htmlFor="cityId"><Select id="cityId" name="cityId" required>{geography.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo de veículo" htmlFor="vehicleType"><Select id="vehicleType" name="vehicleType">{Object.entries(VEHICLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Matrícula (mota/carro)" htmlFor="vehiclePlate"><Input id="vehiclePlate" name="vehiclePlate" /></Field>
              </div>
              <Field label="N.º do documento de identificação (BI/Passaporte)" htmlFor="idNumber"><Input id="idNumber" name="idNumber" required /></Field>
              <Field label="Dados para receber pagamentos" htmlFor="payoutDetails" hint="Ex.: número M-Pesa"><Input id="payoutDetails" name="payoutDetails" /></Field>
              <Field label="Documento de identificação (obrigatório)" htmlFor="ID_CARD"><Input id="ID_CARD" name="ID_CARD" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
              <Field label="Carta de condução" htmlFor="DRIVER_LICENSE"><Input id="DRIVER_LICENSE" name="DRIVER_LICENSE" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
              <Field label="Livrete do veículo" htmlFor="VEHICLE_REGISTRATION"><Input id="VEHICLE_REGISTRATION" name="VEHICLE_REGISTRATION" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
              <Checkbox name="accept" required label={<>Aceito os <Link href="/termos" target="_blank" className="text-brand">termos</Link> e a <Link href="/privacidade" target="_blank" className="text-brand">política de privacidade</Link>, incluindo a partilha de localização durante entregas ativas.</>} />
              <SubmitButton size="lg" className="w-full" pendingText="A enviar…">Enviar candidatura</SubmitButton>
            </ActionForm>
          )}
      </div>
    </div>
  );
}
