import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { loadActiveUser } from "../authz";
import { getSettingsUncached } from "./settings";
import { notifyUsers, adminUserIds } from "./notifications";

export const courierApplicationSchema = z.object({
  cityId: z.string().min(1, "Escolha a cidade."),
  vehicleType: z.enum(["BICYCLE", "MOTORCYCLE", "CAR", "ON_FOOT"]),
  vehiclePlate: z.string().trim().max(20).optional().nullable(),
  idNumber: z.string().trim().min(5, "Indique o número do documento de identificação.").max(30),
  payoutDetails: z.string().trim().max(300).optional().nullable(),
});

export const VEHICLE_LABEL = { BICYCLE: "Bicicleta", MOTORCYCLE: "Mota", CAR: "Carro", ON_FOOT: "A pé" } as const;

export async function applyAsCourier(userId: string, raw: unknown, documents: { type: string; fileId: string }[]) {
  await loadActiveUser(userId);
  const settings = await getSettingsUncached();
  if (!settings.courierSignupOpen) throw new AppError("UNAVAILABLE", "As candidaturas de entregadores estão fechadas.");
  const input = courierApplicationSchema.parse(raw);
  if (input.vehicleType === "MOTORCYCLE" || input.vehicleType === "CAR") {
    if (!input.vehiclePlate) throw new AppError("VALIDATION", "Indique a matrícula do veículo.");
  }
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city || !city.isActive) throw new AppError("VALIDATION", "Cidade inválida.");
  if (await db.courier.findUnique({ where: { userId } })) throw new AppError("CONFLICT", "Já tem uma candidatura de entregador.");
  if (!documents.some((d) => d.type === "ID_CARD")) throw new AppError("VALIDATION", "Carregue o documento de identificação.");
  const courier = await db.courier.create({
    data: {
      userId,
      cityId: city.id,
      vehicleType: input.vehicleType,
      vehiclePlate: input.vehiclePlate || null,
      idNumber: input.idNumber,
      payoutDetails: input.payoutDetails || null,
      documents: { create: documents },
    },
  });
  await audit({ actorId: userId, action: "courier.apply", entityType: "Courier", entityId: courier.id });
  await notifyUsers(await adminUserIds(["OPERATIONS"]), {
    type: "COURIER_APPLICATION",
    title: "Nova candidatura de entregador",
    body: "Um novo entregador aguarda análise.",
    link: `/admin/entregadores/${courier.id}`,
  });
  return courier;
}

export async function updateCourierProfile(userId: string, input: { vehicleType: "BICYCLE" | "MOTORCYCLE" | "CAR" | "ON_FOOT"; vehiclePlate?: string | null; payoutDetails?: string | null }) {
  const courier = await db.courier.findUnique({ where: { userId } });
  if (!courier) throw new AppError("NOT_FOUND", "Conta de entregador não encontrada.");
  await db.courier.update({
    where: { id: courier.id },
    data: { vehicleType: input.vehicleType, vehiclePlate: input.vehiclePlate?.trim() || null, payoutDetails: input.payoutDetails?.trim().slice(0, 300) || null },
  });
}

export async function addCourierDocument(userId: string, type: string, fileId: string) {
  const courier = await db.courier.findUnique({ where: { userId } });
  if (!courier) throw new AppError("NOT_FOUND", "Conta de entregador não encontrada.");
  await db.courierDocument.create({ data: { courierId: courier.id, type, fileId } });
}
