import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { VEHICLE_LABEL } from "@/server/services/couriers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { formatPhone } from "@/lib/utils";
import { profileAction } from "../../actions";

export const metadata = { title: "Perfil" };

export default async function CourierProfile() {
  const user = await requireCourierUser();
  const c = await db.courier.findUniqueOrThrow({ where: { userId: user.id }, include: { city: true } });
  return (
    <div className="max-w-2xl">
      <PageHeader title="Perfil" />
      <Card className="mb-5"><CardBody className="space-y-1 text-sm"><p className="font-semibold">{user.name}</p><p>{formatPhone(user.phone)} · {user.email}</p><p className="text-muted">Cidade: {c.city.name} · N.º identificação: {c.idNumber}</p><p className="text-xs text-muted">Para alterar nome, telefone ou e-mail use a <a href="/minha-conta" className="text-brand">Minha conta</a>.</p></CardBody></Card>
      <Card>
        <CardHeader title="Veículo e pagamentos" />
        <CardBody>
          <ActionForm action={profileAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de veículo" htmlFor="vehicleType"><Select id="vehicleType" name="vehicleType" defaultValue={c.vehicleType}>{Object.entries(VEHICLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Matrícula" htmlFor="vehiclePlate"><Input id="vehiclePlate" name="vehiclePlate" defaultValue={c.vehiclePlate ?? ""} /></Field>
            <Field label="Dados para receber pagamentos" htmlFor="payoutDetails" hint="Ex.: número M-Pesa" className="sm:col-span-2"><Textarea id="payoutDetails" name="payoutDetails" defaultValue={c.payoutDetails ?? ""} className="min-h-16" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
