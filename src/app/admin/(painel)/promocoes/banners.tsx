import { ImageIcon } from "lucide-react";
import type { Banner } from "@prisma/client";
import { db } from "@/server/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { utcToLocalInput } from "@/lib/hours";
import { fileUrl } from "@/server/storage/files";
import { bannerAction, deleteBannerAction } from "@/app/admin/actions";

function BannerForm({ b, cities, tz }: { b?: Banner; cities: { id: string; name: string }[]; tz: string }) {
  return (
    <ActionForm action={bannerAction} resetOnSuccess={!b} className="grid gap-3 sm:grid-cols-2">
      {b && <input type="hidden" name="id" value={b.id} />}
      <Field label="Título" htmlFor={`bt-${b?.id ?? "n"}`}><Input id={`bt-${b?.id ?? "n"}`} name="title" defaultValue={b?.title} required maxLength={80} /></Field>
      <Field label="Subtítulo" htmlFor={`bs-${b?.id ?? "n"}`}><Input id={`bs-${b?.id ?? "n"}`} name="subtitle" defaultValue={b?.subtitle ?? ""} maxLength={120} /></Field>
      <Field label="Link" htmlFor={`bl-${b?.id ?? "n"}`} hint="Ex.: /restaurantes?promo=1"><Input id={`bl-${b?.id ?? "n"}`} name="linkUrl" defaultValue={b?.linkUrl ?? ""} /></Field>
      <Field label="Cidade" htmlFor={`bc-${b?.id ?? "n"}`}><Select id={`bc-${b?.id ?? "n"}`} name="cityId" defaultValue={b?.cityId ?? ""}><option value="">Todas</option>{cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Posição" htmlFor={`bp-${b?.id ?? "n"}`}><Input id={`bp-${b?.id ?? "n"}`} name="position" type="number" defaultValue={b?.position ?? 0} /></Field>
      <Field label="Imagem (JPG, PNG ou WebP, até 8 MB)" htmlFor={`bi-${b?.id ?? "n"}`}><Input id={`bi-${b?.id ?? "n"}`} name="image" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" /></Field>
      <Field label="Início" htmlFor={`bst-${b?.id ?? "n"}`}><Input id={`bst-${b?.id ?? "n"}`} name="startsAt" type="datetime-local" defaultValue={utcToLocalInput(b?.startsAt, tz)} /></Field>
      <Field label="Fim" htmlFor={`be-${b?.id ?? "n"}`}><Input id={`be-${b?.id ?? "n"}`} name="endsAt" type="datetime-local" defaultValue={utcToLocalInput(b?.endsAt, tz)} /></Field>
      <div className="flex flex-wrap gap-4 sm:col-span-2"><Checkbox name="isActive" defaultChecked={b ? b.isActive : true} label="Ativo" />{b?.imageFileId && <Checkbox name="removeImage" label="Remover imagem" />}</div>
      <div className="sm:col-span-2"><SubmitButton>{b ? "Guardar" : "Criar banner"}</SubmitButton></div>
    </ActionForm>
  );
}

export async function Banners({ cities, tz }: { cities: { id: string; name: string }[]; tz: string }) {
  const banners = await db.banner.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  return (
    <div className="space-y-5">
      <Card><CardHeader title="Novo banner" description="Os banners podem existir mesmo sem restaurantes ou produtos." /><CardBody><BannerForm cities={cities} tz={tz} /></CardBody></Card>
      {banners.length === 0 ? <EmptyState icon={ImageIcon} title="Ainda não existem banners" /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {banners.map((b) => (
            <li key={b.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="relative h-28 bg-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {b.imageFileId && <img src={fileUrl(b.imageFileId)!} alt="" className="h-full w-full object-cover" />}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-3 text-white"><p className="font-bold">{b.title}</p>{b.subtitle && <p className="text-xs">{b.subtitle}</p>}</div>
              </div>
              <div className="flex items-center justify-between gap-2 p-3 text-sm">
                <Badge tone={b.isActive ? "green" : "neutral"}>{b.isActive ? "Ativo" : "Inativo"}</Badge>
                <QuickAction action={deleteBannerAction} hidden={{ id: b.id }} label="Eliminar" variant="ghost" confirmMessage="Eliminar este banner?" />
              </div>
              <details className="border-t border-line p-3"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary><div className="mt-3"><BannerForm b={b} cities={cities} tz={tz} /></div></details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
