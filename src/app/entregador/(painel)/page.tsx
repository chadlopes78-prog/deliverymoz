import Link from "next/link";
import { Bike, Wallet, CheckCircle2, Power } from "lucide-react";
import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { courierEarnings } from "@/server/services/finance";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { CourierStatusBadge } from "@/components/admin/restaurant-status";
import { formatMoney } from "@/lib/money";
import { availabilityAction } from "../actions";
import { cn } from "@/lib/utils";

export default async function CourierHome({ searchParams }: { searchParams: Promise<{ candidatura?: string }> }) {
  const sp = await searchParams;
  const user = await requireCourierUser();
  const courier = await db.courier.findUniqueOrThrow({ where: { userId: user.id }, include: { city: true } });
  const [earnings, settings, active, offers] = await Promise.all([
    courierEarnings(courier.id),
    getSettings(),
    db.delivery.findFirst({ where: { courierId: courier.id, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } }, include: { order: { select: { code: true } } } }),
    db.deliveryOffer.count({ where: { courierId: courier.id, status: "OFFERED", expiresAt: { gt: new Date() } } }),
  ]);
  const m = (v: number) => formatMoney(v, settings.currency);
  return (
    <>
      {sp.candidatura && <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Candidatura enviada! Vamos analisar os seus documentos e avisá-lo da decisão.</p>}
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} description={courier.city.name} actions={<CourierStatusBadge status={courier.status} />} />
      {courier.status === "PENDING" && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">A sua conta aguarda aprovação. Depois de aprovada, poderá ficar disponível e receber ofertas de entrega.</p>}
      {(courier.status === "REJECTED" || courier.status === "SUSPENDED") && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">Conta {courier.status === "REJECTED" ? "não aprovada" : "suspensa"}. {courier.statusReason} Contacte o suporte se precisar de ajuda.</p>}
      {courier.status === "APPROVED" && (
        <ActionForm action={availabilityAction} className="mb-5">
          <input type="hidden" name="available" value={courier.isAvailable ? "false" : "true"} />
          <SubmitButton size="lg" variant={courier.isAvailable ? "accent" : "outline"} className={cn("h-20 w-full text-lg", courier.isAvailable && "shadow-lg")}>
            <Power className="h-6 w-6" /> {courier.isAvailable ? "Disponível — toque para ficar indisponível" : "Indisponível — toque para ficar disponível"}
          </SubmitButton>
        </ActionForm>
      )}
      {active && <Link href="/entregador/entregas" className="mb-5 flex items-center gap-3 rounded-2xl bg-brand p-4 font-semibold text-brand-contrast"><Bike className="h-6 w-6" /> Entrega em curso: #{active.order.code} — continuar</Link>}
      {!active && offers > 0 && <Link href="/entregador/entregas" className="mb-5 flex items-center gap-3 rounded-2xl border-2 border-brand bg-brand/5 p-4 font-semibold text-brand"><Bike className="h-6 w-6" /> {offers} oferta(s) de entrega disponível(eis)</Link>}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Entregas concluídas" value={earnings.deliveredCount} icon={CheckCircle2} tone="accent" />
        <StatCard label="Valor calculado" value={m(earnings.earnedCents)} icon={Wallet} />
        <StatCard label="Já pago" value={m(earnings.paidCents)} />
        <StatCard label="Por receber" value={m(earnings.unpaidCents)} tone="warn" />
      </div>
      <Link href="/entregador/historico" className={buttonClass("outline", "md", "mt-5 w-full")}>Ver histórico</Link>
    </>
  );
}
