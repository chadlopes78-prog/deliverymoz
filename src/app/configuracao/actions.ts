"use server";
import { redirect } from "next/navigation";
import { runAction, str, type ActionResult } from "@/server/action";
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
