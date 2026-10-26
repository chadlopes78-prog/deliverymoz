import { db } from "./db";
import { AppError } from "./errors";

/**
 * Limitador de taxa com janela fixa guardado no PostgreSQL, para funcionar
 * entre várias instâncias serverless. Operação atómica via INSERT ... ON CONFLICT.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  if (process.env.DISABLE_RATE_LIMIT === "1") return;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
                     THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  if ((rows[0]?.count ?? 0) > limit) {
    throw new AppError("RATE_LIMITED", "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.");
  }
}
