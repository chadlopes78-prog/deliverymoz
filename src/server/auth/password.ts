import { hash, verify } from "@node-rs/argon2";

// Argon2id com parâmetros recomendados pela OWASP (19 MiB, 2 iterações).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function passwordProblems(password: string): string | null {
  if (password.length < 8) return "A palavra-passe deve ter pelo menos 8 caracteres.";
  if (password.length > 128) return "A palavra-passe é demasiado longa.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return "A palavra-passe deve conter letras e números.";
  return null;
}
