import { FileText } from "lucide-react";
import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { fileUrl } from "@/server/storage/files";
import { formatDate } from "@/components/status";
import { documentAction } from "../../actions";

export const metadata = { title: "Documentos" };
const LABEL: Record<string, string> = { ID_CARD: "Documento de identificação", DRIVER_LICENSE: "Carta de condução", VEHICLE_REGISTRATION: "Livrete do veículo", OTHER: "Outro" };

export default async function CourierDocuments() {
  const user = await requireCourierUser();
  const docs = await db.courierDocument.findMany({ where: { courier: { userId: user.id } }, orderBy: { createdAt: "desc" } });
  return (
    <div className="max-w-2xl">
      <PageHeader title="Documentos" description="Guardados de forma privada. Apenas você e a equipa de operações autorizada lhes têm acesso." />
      <ul className="mb-5 space-y-2">
        {docs.map((d) => <li key={d.id} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-3 text-sm"><a href={fileUrl(d.fileId)!} target="_blank" className="flex items-center gap-2 text-brand"><FileText className="h-4 w-4" />{LABEL[d.type] ?? d.type}</a><span className="text-xs text-muted">{formatDate(d.createdAt, { dateStyle: "short" })}</span></li>)}
      </ul>
      <Card>
        <CardHeader title="Enviar documento" />
        <CardBody>
          <ActionForm action={documentAction} resetOnSuccess className="space-y-3">
            <Field label="Tipo" htmlFor="type"><Select id="type" name="type">{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Ficheiro (PDF, JPG, PNG; até 6 MB)" htmlFor="document"><Input id="document" name="document" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="py-2" /></Field>
            <SubmitButton>Enviar</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
