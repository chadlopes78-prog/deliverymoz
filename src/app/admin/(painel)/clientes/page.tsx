import { redirect } from "next/navigation";

/** Endereço antigo: a lista de clientes passou a chamar-se "Compradores". */
export default function LegacyCustomers() {
  redirect("/admin/compradores");
}
