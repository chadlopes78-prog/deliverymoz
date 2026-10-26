"use client";
import { useState } from "react";
import { Field, Select } from "@/components/ui/field";
import type { Geography } from "@/server/location";

export function CityNeighborhoodSelect({ geography, defaultCityId, defaultNeighborhoodId, neighborhoodRequired = false, idPrefix = "cn" }: { geography: Geography; defaultCityId?: string | null; defaultNeighborhoodId?: string | null; neighborhoodRequired?: boolean; idPrefix?: string }) {
  const [cityId, setCityId] = useState(defaultCityId ?? geography[0]?.id ?? "");
  const city = geography.find((c) => c.id === cityId);
  return (
    <>
      <Field label="Cidade" htmlFor={`${idPrefix}-city`}>
        <Select id={`${idPrefix}-city`} name="cityId" value={cityId} onChange={(e) => setCityId(e.target.value)} required>
          {geography.length === 0 && <option value="">Sem cidades configuradas</option>}
          {geography.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label={neighborhoodRequired ? "Bairro" : "Bairro (opcional)"} htmlFor={`${idPrefix}-nb`}>
        <Select id={`${idPrefix}-nb`} name="neighborhoodId" defaultValue={cityId === defaultCityId ? (defaultNeighborhoodId ?? "") : ""} key={cityId} required={neighborhoodRequired}>
          <option value="">{neighborhoodRequired ? "Escolha" : "—"}</option>
          {city?.neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </Select>
      </Field>
    </>
  );
}
