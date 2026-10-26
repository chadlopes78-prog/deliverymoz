"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/guards";
import { runAction, str, optStr, bool, optNum, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { updateProfile, changePassword, closeAccount } from "@/server/services/accounts";
import { saveAddress, deleteAddress, markNotificationsRead, updateNotificationPrefs } from "@/server/services/customer";
import { destroyAllSessions, destroySession } from "@/server/auth/session";

export async function profileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await updateProfile(user.id, { name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email") });
    revalidatePath("/minha-conta");
  }, "Perfil atualizado.");
}

export async function addressAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await saveAddress(user.id, optStr(fd, "id"), {
      label: str(fd, "label") || "Casa",
      cityId: str(fd, "cityId"),
      neighborhoodId: str(fd, "neighborhoodId"),
      street: str(fd, "street"),
      reference: optStr(fd, "reference"),
      latitude: optNum(fd, "latitude"),
      longitude: optNum(fd, "longitude"),
      isDefault: bool(fd, "isDefault"),
    });
    revalidatePath("/minha-conta/enderecos");
  }, "Endereço guardado.");
}

export async function deleteAddressAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await deleteAddress(user.id, str(fd, "id"));
    revalidatePath("/minha-conta/enderecos");
  }, "Endereço removido.");
}

export async function readNotificationsAction(_: ActionResult): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await markNotificationsRead(user.id);
    revalidatePath("/", "layout");
  });
}

export async function prefsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await updateNotificationPrefs(user.id, { notifyEmailOrders: bool(fd, "notifyEmailOrders"), notifyEmailMarketing: bool(fd, "notifyEmailMarketing"), notifyInApp: bool(fd, "notifyInApp") });
    revalidatePath("/minha-conta/notificacoes");
  }, "Preferências guardadas.");
}

export async function passwordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) throw new AppError("VALIDATION", "As palavras-passe não coincidem.");
    await changePassword(user.id, String(fd.get("current") ?? ""), next);
    await destroyAllSessions(user.id, true);
  }, "Palavra-passe alterada. As outras sessões foram terminadas.");
}

export async function logoutOthersAction(_: ActionResult): Promise<ActionResult> {
  const user = await requireUser();
  return runAction(async () => {
    await destroyAllSessions(user.id, true);
    revalidatePath("/minha-conta/seguranca");
  }, "Sessões noutros dispositivos terminadas.");
}

export async function closeAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const r = await runAction(async () => {
    if (str(fd, "confirm") !== "ENCERRAR") throw new AppError("VALIDATION", "Escreva ENCERRAR para confirmar.");
    await closeAccount(user.id, String(fd.get("password") ?? ""));
    await destroySession();
  });
  if (r?.ok) redirect("/?conta-encerrada=1");
  return r;
}
