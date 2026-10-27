import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { Campaign } from "@prisma/client";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { campaignResults } from "@/server/services/marketing";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/tabs";
import { formatMoney } from "@/lib/money";
import { utcToLocalInput } from "@/lib/hours";
import { campaignAction } from "@/app/admin/actions";
import { Banners } from "./banners";

export const metadata = { title: "Promoções e banners" };

export default async function Promotions({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "campanhas" } = await searchParams;
  await requireAdmin("marketing.manage");
  const [settings, cities, restaurants] = await Promise.all([getSettings(), db.city.findMany({ orderBy: { name: "asc" } }), db.restaurant.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true, isFeatured: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="Promoções e banners" description="Campanhas, banners da página inicial e restaurantes em destaque." />
      <Tabs base="/admin/promocoes" current={tab} tabs={[["campanhas", "Campanhas"], ["banners", "Banners"], ["destaques", "Destaques"]]} />
      {tab === "campanhas" && <Campaigns cities={cities} restaurants={restaurants} tz={settings.timezone} cur={settings.currency} />}
      {tab === "banners" && <Banners cities={cities} tz={settings.timezone} />}
      {tab === "destaques" && (
        <Card>
          <CardHeader title="Restaurantes em destaque" description="Defina o destaque na página de cada restaurante." />
          <CardBody>
            {restaurants.filter((r) => r.isFeatured).length === 0 ? <p className="text-sm text-muted">Nenhum restaurante em destaque.</p> : (
              <ul className="space-y-1 text-sm">{restaurants.filter((r) => r.isFeatured).map((r) => <li key={r.id}><Link className="text-brand" href={`/admin/restaurantes/${r.id}`}>{r.name}</Link></li>)}</ul>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

function CampaignForm({ c, cities, restaurants, tz }: { c?: Campaign; cities: { id: string; name: string }[]; restaurants: { id: string; name: string }[]; tz: string }) {
  return (
    <ActionForm action={campaignAction} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Nome" htmlFor={`cn-${c?.id ?? "n"}`}><Input id={`cn-${c?.id ?? "n"}`} name="name" defaultValue={c?.name} required /></Field>
      <Field label="Cidade" htmlFor={`cc-${c?.id ?? "n"}`}><Select id={`cc-${c?.id ?? "n"}`} name="cityId" defaultValue={c?.cityId ?? ""}><option value="">Todas</option>{cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Restaurante" htmlFor={`cr-${c?.id ?? "n"}`}><Select id={`cr-${c?.id ?? "n"}`} name="restaurantId" defaultValue={c?.restaurantId ?? ""}><option value="">Todos</option>{restaurants.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Início" htmlFor={`cs-${c?.id ?? "n"}`}><Input id={`cs-${c?.id ?? "n"}`} name="startsAt" type="datetime-local" defaultValue={utcToLocalInput(c?.startsAt, tz)} /></Field>
      <Field label="Fim" htmlFor={`ce-${c?.id ?? "n"}`}><Input id={`ce-${c?.id ?? "n"}`} name="endsAt" type="datetime-local" defaultValue={utcToLocalInput(c?.endsAt, tz)} /></Field>
      <Field label="Descrição" htmlFor={`cd-${c?.id ?? "n"}`} className="sm:col-span-2"><Textarea id={`cd-${c?.id ?? "n"}`} name="description" defaultValue={c?.description ?? ""} className="min-h-14" /></Field>
      <Checkbox name="isActive" defaultChecked={c ? c.isActive : true} label="Ativa" />
      <div className="sm:col-span-2"><SubmitButton>{c ? "Guardar" : "Criar campanha"}</SubmitButton></div>
    </ActionForm>
  );
}

async function Campaigns({ cities, restaurants, tz, cur }: { cities: { id: string; name: string }[]; restaurants: { id: string; name: string }[]; tz: string; cur: string }) {
  const campaigns = await db.campaign.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { coupons: true } } } });
  const results = await Promise.all(campaigns.map((c) => campaignResults(c.id)));
  return (
    <div className="space-y-5">
      <Card><CardHeader title="Nova campanha" description="Associe cupões a uma campanha (em Cupões) para medir resultados." /><CardBody><CampaignForm cities={cities} restaurants={restaurants} tz={tz} /></CardBody></Card>
      {campaigns.length === 0 ? <EmptyState icon={Megaphone} title="Ainda não existem campanhas" /> : (
        <ul className="space-y-3">
          {campaigns.map((c, i) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.name}</span><Badge tone={c.isActive ? "green" : "neutral"}>{c.isActive ? "Ativa" : "Inativa"}</Badge></div>
              <p className="mt-1 text-muted">{c._count.coupons} cupões · Resultados reais: {results[i].orders} pedidos · {formatMoney(results[i].grossCents, cur)} em vendas · {formatMoney(results[i].discountCents, cur)} em descontos</p>
              <details className="mt-2"><summary className="cursor-pointer font-semibold text-brand">Editar</summary><div className="mt-3"><CampaignForm c={c} cities={cities} restaurants={restaurants} tz={tz} /></div></details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

