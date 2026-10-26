"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { requireUser, requireCourierUser } from "@/server/guards";
import { runAction, str, optStr, bool, file, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { destroySession } from "@/server/auth/session";
import { db } from "@/server/db";
import { applyAsCourier, updateCourierProfile, addCourierDocument } from "@/server/services/couriers";
import { setCourierAvailability, acceptOffer, declineOffer, courierAdvance, reportDeliveryIssue } from "@/server/services/deliveries";
import { storePrivateDocument } from "@/server/storage/files";

export async function courierLogoutAction() {
  await destroySession();
  redirect("/entrar");
}

export async function applyCourierAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser("/entregador/registo");
  const r = await runAction(async () => {
    const docs: { type: string; fileId: string }[] = [];
    for (const type of ["ID_CARD", "DRIVER_LICENSE", "VEHICLE_REGISTRATION"]) {
      const f = file(fd, type);
      if (f) docs.push({ type, fileId: (await storePrivateDocument(user.id, f, "courier_document")).id });
    }
    if (!docs.some((d) => d.type === "ID_CARD")) throw new AppError("VALIDATION", "Carregue o documento de identificação.");
    await applyAsCourier(user.id, {
      cityId: str(fd, "cityId"), vehicleType: str(fd, "vehicleType"), vehiclePlate: optStr(fd, "vehiclePlate"),
      idNumber: str(fd, "idNumber"), payoutDetails: optStr(fd, "payoutDetails"),
    }, docs);
  });
  if (r?.ok) redirect("/entregador?candidatura=1");
  return r;
}

export async function availabilityAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await setCourierAvailability(user.id, bool(fd, "available"));
    revalidatePath("/entregador", "layout");
  });
}

export async function acceptOfferAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await acceptOffer(user.id, str(fd, "offerId"));
    revalidatePath("/entregador", "layout");
  }, "Entrega aceite. Dirija-se ao restaurante.");
}

export async function declineOfferAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await declineOffer(user.id, str(fd, "offerId"));
    revalidatePath("/entregador", "layout");
  });
}

export async function advanceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await courierAdvance(user.id, str(fd, "deliveryId"), str(fd, "to") as OrderStatus, { cashCollected: bool(fd, "cashCollected") });
    revalidatePath("/entregador", "layout");
  });
}

export async function issueAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await reportDeliveryIssue(user.id, str(fd, "deliveryId"), str(fd, "type"), str(fd, "description"));
  }, "Problema reportado à equipa de operações.");
}

export async function profileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await updateCourierProfile(user.id, { vehicleType: str(fd, "vehicleType") as "BICYCLE", vehiclePlate: optStr(fd, "vehiclePlate"), payoutDetails: optStr(fd, "payoutDetails") });
    revalidatePath("/entregador/perfil");
  }, "Perfil atualizado.");
}

export async function documentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    const f = file(fd, "document");
    if (!f) throw new AppError("VALIDATION", "Escolha um ficheiro.");
    const stored = await storePrivateDocument(user.id, f, "courier_document");
    await addCourierDocument(user.id, str(fd, "type") || "OTHER", stored.id);
    revalidatePath("/entregador/documentos");
  }, "Documento enviado.");
}

export async function locationConsentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireCourierUser();
  return runAction(async () => {
    await db.user.update({ where: { id: user.id }, data: { locationConsentAt: bool(fd, "consent") ? new Date() : null } });
    revalidatePath("/entregador", "layout");
  });
}
