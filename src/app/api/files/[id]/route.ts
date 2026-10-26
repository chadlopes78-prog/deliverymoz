import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/auth/session";
import { canReadPrivateFile } from "@/server/storage/files";

/** Serve ficheiros. Públicos com cache longa; privados apenas após verificação de permissões, sem cache. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await db.storedFile.findUnique({ where: { id } });
  if (!file) return new NextResponse("Não encontrado", { status: 404 });
  if (file.visibility === "PRIVATE") {
    const user = await getSessionUser();
    if (!canReadPrivateFile(user, file)) return new NextResponse("Não encontrado", { status: 404 });
  }
  if (file.driver !== "db" && file.url) return NextResponse.redirect(file.url, 308);
  if (!file.data) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": file.visibility === "PUBLIC" ? "public, max-age=31536000, immutable" : "private, no-store",
      ...(file.visibility === "PRIVATE" ? { "Content-Disposition": `inline; filename="documento-${file.id}${file.mimeType === "application/pdf" ? ".pdf" : ".jpg"}"` } : {}),
    },
  });
}
