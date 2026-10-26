import { MapPin } from "lucide-react";
import { requireUser } from "@/server/guards";
import { db } from "@/server/db";
import { getGeography } from "@/server/location";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AddressForm } from "@/components/public/address-form";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { addressAction, deleteAddressAction } from "../actions";

export default async function AddressesPage() {
  const user = await requireUser("/minha-conta/enderecos");
  const [addresses, geography] = await Promise.all([
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], include: { city: true, neighborhood: true } }),
    getGeography(),
  ]);
  return (
    <div className="space-y-5">
      {addresses.length === 0 ? <EmptyState icon={MapPin} title="Nenhum endereço guardado" description="Guarde os seus endereços para finalizar pedidos mais depressa." /> : (
        <ul className="space-y-2.5">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold">{a.label} {a.isDefault && <Badge tone="brand">Principal</Badge>}</p>
                  <p>{a.street}, {a.neighborhood.name}, {a.city.name}</p>
                  {a.reference && <p className="text-muted">Ref.: {a.reference}</p>}
                </div>
                <ActionForm action={deleteAddressAction} confirmMessage="Remover este endereço?" hideMessage>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-sm font-semibold text-red-600">Remover</button>
                </ActionForm>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                <div className="mt-3"><AddressForm action={addressAction} geography={geography} initial={{ id: a.id, label: a.label, cityId: a.cityId, neighborhoodId: a.neighborhoodId, street: a.street, reference: a.reference, isDefault: a.isDefault, latitude: a.latitude, longitude: a.longitude }} /></div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader title="Novo endereço" />
        <CardBody><AddressForm action={addressAction} geography={geography} /></CardBody>
      </Card>
    </div>
  );
}
