import Link from "next/link";
import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { QuickAction } from "@/components/reason-form";
import { locationConsentAction } from "../../actions";

export const metadata = { title: "Configurações" };

export default async function CourierSettings() {
  const user = await requireCourierUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { locationConsentAt: true } });
  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Configurações" />
      <Card>
        <CardHeader title="Partilha de localização" description="A localização só é enviada durante uma entrega ativa e é usada para o cliente acompanhar a entrega. Pode também bloquear a permissão nas definições do navegador." />
        <CardBody>
          <p className="mb-3 text-sm">{u.locationConsentAt ? "Autorizada." : "Não autorizada."}</p>
          <QuickAction action={locationConsentAction} hidden={{ consent: u.locationConsentAt ? "false" : "true" }} label={u.locationConsentAt ? "Retirar autorização" : "Autorizar"} />
        </CardBody>
      </Card>
      <Card><CardHeader title="Conta e notificações" /><CardBody className="text-sm"><Link href="/minha-conta" className="text-brand">Gerir dados pessoais, palavra-passe e notificações</Link></CardBody></Card>
    </div>
  );
}
