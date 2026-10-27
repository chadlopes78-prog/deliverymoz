import { requireAdmin } from "@/server/guards";
import { getGeography } from "@/server/location";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { GeoFields } from "@/components/admin/geo-fields";
import { ImageField } from "@/components/admin/image-field";
import { SubmitButton } from "@/components/ui/button";
import { CityNeighborhoodSelect } from "@/components/city-neighborhood";
import { OwnerFields } from "@/components/admin/owner-fields";
import { createRestaurantAction } from "@/app/admin/actions";

export const metadata = { title: "Adicionar restaurante" };

export default async function NewRestaurant() {
  await requireAdmin("restaurants.manage");
  const geography = await getGeography();
  return (
    <>
      <PageHeader title="Adicionar restaurante" description="O restaurante é criado como aprovado. Depois de guardar, defina horário, zonas de entrega e produtos para o publicar." />
      {geography.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Adicione primeiro uma cidade em Configurações → Localizações.</p>
      ) : (
        <ActionForm action={createRestaurantAction} className="space-y-5">
          <Card>
            <CardHeader title="Dados do restaurante" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome comercial" htmlFor="name"><Input id="name" name="name" required /></Field>
              <Field label="Nome do responsável" htmlFor="responsibleName"><Input id="responsibleName" name="responsibleName" required /></Field>
              <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" required /></Field>
              <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
              <Field label="Descrição" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" maxLength={1000} /></Field>
              <CityNeighborhoodSelect geography={geography} />
              <Field label="Endereço" htmlFor="addressLine"><Input id="addressLine" name="addressLine" required /></Field>
              <Field label="Referência" htmlFor="addressReference"><Input id="addressReference" name="addressReference" /></Field>
              <Field label="Denominação social" htmlFor="legalName"><Input id="legalName" name="legalName" /></Field>
              <Field label="NUIT" htmlFor="nuit"><Input id="nuit" name="nuit" inputMode="numeric" /></Field>
              <GeoFields />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Imagens e estado" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <ImageField name="logo" label="Logótipo" />
              <ImageField name="cover" label="Capa" wide />
              <Checkbox name="paused" label="Criar com a loja pausada (não recebe pedidos até ser ativada)" className="sm:col-span-2" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Acesso ao painel do restaurante" />
            <CardBody><OwnerFields /></CardBody>
          </Card>
          <SubmitButton size="lg">Criar restaurante</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
