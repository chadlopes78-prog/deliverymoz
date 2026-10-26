import "server-only";
import { emailConfigured } from "./email";
import { blobConfigured } from "./storage/files";

/** Estado real de cada integração externa (sem expor valores secretos). */
export function integrationStatus() {
  return [
    { key: "database", name: "Base de dados PostgreSQL", configured: !!process.env.DATABASE_URL, required: true, note: "DATABASE_URL / DIRECT_URL" },
    { key: "setup", name: "Código de configuração inicial", configured: (process.env.SETUP_TOKEN ?? "").length >= 16, required: false, note: "SETUP_TOKEN — necessário apenas para criar a conta do proprietário" },
    { key: "cron", name: "Tarefas periódicas (Vercel Cron)", configured: !!process.env.CRON_SECRET, required: true, note: "CRON_SECRET — reconciliação de pagamentos, expiração de pedidos, reenvio de ofertas" },
    { key: "email", name: "E-mail transacional (Resend)", configured: emailConfigured(), required: false, note: "RESEND_API_KEY e EMAIL_FROM — sem isto, os e-mails não são enviados (ficam registados como não configurados)" },
    { key: "blob", name: "Armazenamento de imagens (Vercel Blob)", configured: blobConfigured(), required: false, note: "BLOB_READ_WRITE_TOKEN — sem isto, as imagens ficam guardadas na base de dados" },
    { key: "app_url", name: "URL pública", configured: !!process.env.APP_URL, required: true, note: "APP_URL — links em e-mails, sitemap e metadados" },
    { key: "maps", name: "Mapas e GPS em tempo real", configured: false, required: false, note: "Não integrado: é usada a localização do navegador (com autorização) e links para o Google Maps." },
    { key: "push", name: "Notificações push / SMS", configured: false, required: false, note: "Não integrado: notificações dentro do site e por e-mail." },
  ];
}
