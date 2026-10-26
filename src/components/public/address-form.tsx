"use client";
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import type { Geography } from "@/server/location";

export function AddressForm({ action, geography, initial, onDone }: { action: FormAction; geography: Geography; initial?: { id: string; label: string; cityId: string; neighborhoodId: string; street: string; reference: string | null; isDefault: boolean; latitude: number | null; longitude: number | null }; onDone?: () => void }) {
  const [cityId, setCityId] = useState(initial?.cityId ?? geography[0]?.id ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initial?.latitude != null && initial.longitude != null ? { lat: initial.latitude, lng: initial.longitude } : null);
  const [msg, setMsg] = useState<string | null>(null);
  const city = geography.find((c) => c.id === cityId);
  if (!geography.length) return <p className="text-sm text-muted">Ainda não existem cidades atendidas.</p>;
  return (
    <ActionForm action={action} resetOnSuccess={!initial} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Nome" htmlFor={`label-${initial?.id ?? "new"}`}><Input id={`label-${initial?.id ?? "new"}`} name="label" defaultValue={initial?.label ?? "Casa"} maxLength={40} required /></Field>
      <Field label="Cidade" htmlFor={`city-${initial?.id ?? "new"}`}>
        <Select id={`city-${initial?.id ?? "new"}`} name="cityId" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          {geography.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Bairro" htmlFor={`nb-${initial?.id ?? "new"}`}>
        <Select id={`nb-${initial?.id ?? "new"}`} name="neighborhoodId" defaultValue={initial?.cityId === cityId ? initial.neighborhoodId : ""} key={cityId} required>
          <option value="">Escolha</option>
          {city?.neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </Select>
      </Field>
      <Field label="Rua e número" htmlFor={`street-${initial?.id ?? "new"}`}><Input id={`street-${initial?.id ?? "new"}`} name="street" defaultValue={initial?.street} required minLength={3} /></Field>
      <Field label="Ponto de referência" htmlFor={`ref-${initial?.id ?? "new"}`} className="sm:col-span-2"><Input id={`ref-${initial?.id ?? "new"}`} name="reference" defaultValue={initial?.reference ?? ""} maxLength={300} /></Field>
      <div className="sm:col-span-2">
        <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-brand" onClick={() => {
          if (!("geolocation" in navigator)) return setMsg("Localização não suportada.");
          navigator.geolocation.getCurrentPosition((p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setMsg("Coordenadas guardadas com o endereço."); }, () => setMsg("Não foi possível obter a localização."));
        }}><LocateFixed className="h-4 w-4" /> Usar a minha localização (opcional)</button>
        {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
        {coords && <><input type="hidden" name="latitude" value={coords.lat} /><input type="hidden" name="longitude" value={coords.lng} /></>}
      </div>
      <Checkbox name="isDefault" label="Endereço principal" defaultChecked={initial?.isDefault} className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton>Guardar endereço</SubmitButton></div>
    </ActionForm>
  );
}
