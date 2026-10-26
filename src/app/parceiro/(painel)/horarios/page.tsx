import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { HoursEditor } from "@/components/partner/hours-editor";
import { minutesToTime } from "@/lib/utils";
import { hoursAction } from "../../actions";

export const metadata = { title: "Horários" };

export default async function Hours() {
  const ctx = await requirePartner("store.manage");
  const hours = await db.restaurantHour.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] });
  const initial = Array.from({ length: 7 }, (_, d) => hours.filter((h) => h.dayOfWeek === d).map((h) => ({ opens: minutesToTime(h.opensAt), closes: minutesToTime(h.closesAt) })));
  return (
    <div className="max-w-2xl">
      <PageHeader title="Horário de funcionamento" description="Fora deste horário, os clientes veem o restaurante como fechado e não podem encomendar." />
      <HoursEditor action={hoursAction} initial={initial} />
    </div>
  );
}
