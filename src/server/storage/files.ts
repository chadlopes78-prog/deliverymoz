import sharp from "sharp";
import { db } from "../db";
import { AppError } from "../errors";
import { sha256 } from "../auth/tokens";
import { hasAdminPermission, type PermissionSubject } from "../permissions";

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_DOC = 6 * 1024 * 1024;

export function detectType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function blobConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

async function putPublicBlob(pathname: string, data: Buffer, contentType: string): Promise<string> {
  // Vercel Blob (https://vercel.com/docs/vercel-blob/using-blob-sdk). Carregado apenas quando configurado.
  const { put } = await import("@vercel/blob");
  const res = await put(pathname, data, { access: "public", contentType, addRandomSuffix: true });
  return res.url;
}

/**
 * Guarda uma imagem pública. A imagem é sempre descodificada e re-codificada em WebP
 * (remove metadados EXIF/GPS e neutraliza ficheiros poliglotas). Limite: 8 MB.
 */
export async function storePublicImage(ownerId: string, file: File, purpose: string, maxSize = 1600) {
  if (!file || file.size === 0) throw new AppError("VALIDATION", "Escolha uma imagem.");
  if (file.size > MAX_IMAGE) throw new AppError("VALIDATION", "A imagem não pode exceder 8 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectType(buf);
  if (!type || type === "application/pdf") throw new AppError("VALIDATION", "Formato não suportado. Use JPG, PNG ou WebP.");
  let out: Buffer;
  let meta: { width: number; height: number };
  try {
    const r = await sharp(buf, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    out = r.data;
    meta = r.info;
  } catch {
    throw new AppError("VALIDATION", "Não foi possível ler a imagem.");
  }
  const hash = sha256(out);
  if (blobConfigured()) {
    const url = await putPublicBlob(`${purpose}/${hash.slice(0, 16)}.webp`, out, "image/webp");
    return db.storedFile.create({
      data: { ownerId, visibility: "PUBLIC", purpose, mimeType: "image/webp", size: out.length, sha256: hash, width: meta.width, height: meta.height, driver: "vercel-blob", url, originalName: file.name.slice(0, 200) },
    });
  }
  return db.storedFile.create({
    data: { ownerId, visibility: "PUBLIC", purpose, mimeType: "image/webp", size: out.length, sha256: hash, width: meta.width, height: meta.height, driver: "db", data: new Uint8Array(out), originalName: file.name.slice(0, 200) },
  });
}

/**
 * Guarda um documento privado (PDF, JPG, PNG, WebP; até 6 MB) na base de dados.
 * Só é servido através de /api/files/[id] após verificação de permissões.
 */
export async function storePrivateDocument(ownerId: string, file: File, purpose: string) {
  if (!file || file.size === 0) throw new AppError("VALIDATION", "Escolha um ficheiro.");
  if (file.size > MAX_DOC) throw new AppError("VALIDATION", "O documento não pode exceder 6 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectType(buf);
  if (!type) throw new AppError("VALIDATION", "Formato não suportado. Use PDF, JPG, PNG ou WebP.");
  let data = buf;
  let mimeType: string = type;
  if (type !== "application/pdf") {
    try {
      data = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      mimeType = "image/jpeg";
    } catch {
      throw new AppError("VALIDATION", "Não foi possível ler a imagem.");
    }
  }
  return db.storedFile.create({
    data: { ownerId, visibility: "PRIVATE", purpose, mimeType, size: data.length, sha256: sha256(data), driver: "db", data: new Uint8Array(data), originalName: file.name.slice(0, 200) },
  });
}

export function fileUrl(id: string | null | undefined): string | null {
  return id ? `/api/files/${id}` : null;
}

/** Regras de acesso a ficheiros privados. */
export function canReadPrivateFile(
  user: (PermissionSubject & { id: string }) | null,
  file: { ownerId: string | null; purpose: string },
): boolean {
  if (!user) return false;
  if (file.ownerId && file.ownerId === user.id) return true;
  if (file.purpose.startsWith("courier_")) return hasAdminPermission(user, "couriers.view");
  if (file.purpose.startsWith("restaurant_")) return hasAdminPermission(user, "restaurants.view");
  return hasAdminPermission(user, "settings.manage");
}
