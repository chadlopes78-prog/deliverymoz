/**
 * Cria a conta do proprietário (Super Admin) pela linha de comandos.
 * Uso: SETUP_TOKEN=... OWNER_NAME="..." OWNER_EMAIL=... OWNER_PHONE=84xxxxxxx OWNER_PASSWORD='...' npm run owner:create
 * Só funciona enquanto não existir nenhum Super Admin.
 */
import { createOwner } from "../src/server/services/accounts";
import { db } from "../src/server/db";

async function main() {
  const { SETUP_TOKEN, OWNER_NAME, OWNER_EMAIL, OWNER_PHONE, OWNER_PASSWORD } = process.env;
  if (!SETUP_TOKEN || !OWNER_NAME || !OWNER_EMAIL || !OWNER_PHONE || !OWNER_PASSWORD) {
    console.error("Defina SETUP_TOKEN, OWNER_NAME, OWNER_EMAIL, OWNER_PHONE e OWNER_PASSWORD.");
    process.exit(1);
  }
  const u = await createOwner({ setupToken: SETUP_TOKEN, name: OWNER_NAME, email: OWNER_EMAIL, phone: OWNER_PHONE, password: OWNER_PASSWORD }, "cli");
  console.log(`Conta do proprietário criada: ${u.email}`);
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
