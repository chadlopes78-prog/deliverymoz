import { redirect } from "next/navigation";

/** Endereço antigo: "Funcionários" passou a "Administradores e permissões". */
export default function LegacyStaff() {
  redirect("/admin/administradores");
}
