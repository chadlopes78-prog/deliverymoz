"use server";
import { redirect } from "next/navigation";
import { runAction, str, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { createOwner } from "@/server/services/accounts";
import { createSession } from "@/server/auth/session";
import { requestInfo } from "@/server/request";

export async function setupOwnerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { ip } = await requestInfo();
    const owner = await createOwner({ setupToken: String(fd.get("setupToken") ?? ""), name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone"), password: String(fd.get("password") ?? "") }, ip);
    await createSession(owner.id);
  });
  if (r?.ok) redirect("/admin");
  return r;
}

/** Ativa a conta com sessão iniciada como proprietária (código do servidor + palavra-passe atual). */
export async function activateOwnerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { getSessionUser } = await import("@/server/auth/session");
  const { activateOwnerAccount } = await import("@/server/services/accounts");
  const r = await runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Inicie sessão primeiro.");
    const { ip } = await requestInfo();
    await activateOwnerAccount(user.id, String(fd.get("setupToken") ?? ""), String(fd.get("password") ?? ""), ip);
  });
  if (r?.ok) redirect("/admin");
  return r;
}
