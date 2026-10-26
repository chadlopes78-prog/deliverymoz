"use client";
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";

export function OwnerFields() {
  const [mode, setMode] = useState("new");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Conta do proprietário" htmlFor="ownerMode" className="sm:col-span-2">
        <Select id="ownerMode" name="ownerMode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="new">Criar nova conta para o proprietário</option>
          <option value="existing">Associar a uma conta existente (e-mail)</option>
          <option value="none">Sem conta por agora (gerido pela administração)</option>
        </Select>
      </Field>
      {mode !== "none" && <Field label="E-mail do proprietário" htmlFor="ownerEmail"><Input id="ownerEmail" name="ownerEmail" type="email" required /></Field>}
      {mode === "new" && (
        <>
          <Field label="Nome do proprietário" htmlFor="ownerName"><Input id="ownerName" name="ownerName" required /></Field>
          <Field label="Telefone do proprietário" htmlFor="ownerPhone"><Input id="ownerPhone" name="ownerPhone" type="tel" required /></Field>
          <Field label="Palavra-passe inicial" htmlFor="ownerPassword" hint="Partilhe-a de forma segura; o proprietário deve alterá-la."><Input id="ownerPassword" name="ownerPassword" type="password" required minLength={8} autoComplete="new-password" /></Field>
        </>
      )}
    </div>
  );
}
