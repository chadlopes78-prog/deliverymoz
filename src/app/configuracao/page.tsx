import { redirect } from "next/navigation";

/** Endereço antigo: a criação do proprietário e o login administrativo estão em /admin/login. */
export default function SetupPage() {
  redirect("/admin/login");
}
