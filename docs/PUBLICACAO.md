# Publicação (Vercel)

Publicar na Vercel **não** configura automaticamente a base de dados, o armazenamento, os pagamentos nem o e-mail. Cada serviço tem de ser ligado e configurado.

## 1. Base de dados PostgreSQL gerida

Use, por exemplo, Neon, Supabase ou o Postgres do Marketplace da Vercel. Escolha uma região próxima da região das funções (ex.: `fra1`/Europa, `cpt1`/Cidade do Cabo, se disponível no seu plano).

- `DATABASE_URL`: URL **com pooling** (PgBouncer), com `?sslmode=require&pgbouncer=true&connection_limit=5`
- `DIRECT_URL`: URL **direta** (para migrações)

## 2. Projeto na Vercel

1. Importe o repositório.
2. Build Command: `npm run vercel-build` (gera o cliente Prisma, aplica as migrações e faz o build).
3. Variáveis de ambiente (Production e Preview): `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (domínio final), `CRON_SECRET` (aleatório), `SETUP_TOKEN` (só para criar o proprietário) e, opcionalmente, `RESEND_API_KEY`, `EMAIL_FROM`, `BLOB_READ_WRITE_TOKEN` e `MPESA_*`.
4. Faça o deploy, abra `https://o-seu-dominio/configuracao` e crie a conta do proprietário. Depois, remova `SETUP_TOKEN` e faça um redeploy.

## 3. Tarefas periódicas (Cron)

`vercel.json` agenda `/api/cron/maintenance` **a cada 5 minutos**. A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente quando `CRON_SECRET` está definido. A tarefa reconcilia pagamentos incertos, expira pedidos não pagos, reenvia ofertas de entrega e limpa sessões expiradas.
> O plano Hobby da Vercel só permite crons diários. Use o plano Pro ou um agendador externo (ex.: cron-job.org) que chame o endpoint com o cabeçalho de autorização.

## 4. Armazenamento de imagens

Opcional mas recomendado: crie um **Vercel Blob** (Storage → Blob) e ligue-o ao projeto (`BLOB_READ_WRITE_TOKEN`). As imagens públicas passam a ir para o Blob. Os documentos privados (entregadores e restaurantes) ficam sempre na base de dados e só são servidos com autorização.

## 5. E-mail transacional

Crie uma conta na Resend, verifique o domínio (registos DNS SPF/DKIM) e defina `RESEND_API_KEY` e `EMAIL_FROM="Nome <nao-responder@o-seu-dominio>"`.

## 6. Domínio e HTTPS

Vercel → Settings → Domains: adicione o domínio e configure os DNS indicados. O HTTPS é emitido automaticamente. Confirme:
- `https://o-seu-dominio/api/health` → `{"ok":true,"database":"ok"}`
- Admin → Configurações → Geral → "Domínio público": `https://o-seu-dominio` (usado em SEO e e-mails)
- O cabeçalho `Strict-Transport-Security` está presente

## 7. Webhooks

O endpoint genérico é `https://o-seu-dominio/api/webhooks/{fornecedor}`. A API M-Pesa C2B de Moçambique é síncrona e não usa webhooks. Os futuros fornecedores com webhooks devem configurar este URL no painel respetivo.

## 8. Backups e recuperação

- Ative os **backups automáticos / point-in-time recovery** do fornecedor PostgreSQL (Neon e Supabase oferecem PITR, consoante o plano).
- Backup lógico adicional (semanal, guardado fora do fornecedor):
  `pg_dump "$DIRECT_URL" --format=custom --no-owner -f backup-$(date +%F).dump`
- Recuperação: crie uma base de dados nova, `pg_restore --no-owner -d "$NOVA_DIRECT_URL" backup.dump`, atualize `DATABASE_URL`/`DIRECT_URL` e faça um redeploy.
- Teste a recuperação pelo menos uma vez antes do lançamento.
- Se as imagens estiverem no Blob, exporte-as periodicamente (por exemplo, com `@vercel/blob` `list()` e download).

## 9. Monitorização

- Vercel → Logs / Observability para erros de execução.
- Admin → Auditoria → Erros (tabela `ErrorLog`), E-mails e Webhooks.
- Monitor de disponibilidade externo (ex.: UptimeRobot) sobre `/api/health`.

## Lista de lançamento

- [ ] Base de dados gerida com backups/PITR ativos e restauro testado
- [ ] `npm run vercel-build` sem erros; migrações aplicadas
- [ ] Conta do proprietário criada e `SETUP_TOKEN` removido
- [ ] Domínio, HTTPS e "Domínio público" configurados
- [ ] `CRON_SECRET` definido e cron a correr (ver logs)
- [ ] E-mail configurado e testado (recuperação de palavra-passe)
- [ ] Vercel Blob ligado (recomendado)
- [ ] Cidades e bairros configurados
- [ ] Métodos de pagamento: numerário ativado e/ou M-Pesa testado em sandbox e depois em produção
- [ ] Taxas e comissão definidas
- [ ] Termos e política de privacidade **revistos por um jurista** (Admin → Configurações → Legal)
- [ ] Contactos de suporte preenchidos
- [ ] Primeiro restaurante com cardápio, horário e zonas; pedido de teste real feito de ponta a ponta e depois cancelado/reembolsado
- [ ] Monitor de disponibilidade em `/api/health`
