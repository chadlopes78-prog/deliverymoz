# DeliveryMoz — plataforma de delivery para Moçambique

Marketplace de entrega de comida com quatro áreas ligadas ao mesmo backend e à mesma base de dados:

| Área | Rota | Para quem |
|---|---|---|
| Site público e conta do cliente | `/`, `/restaurantes`, `/restaurante/[slug]`, `/sacola`, `/checkout`, `/acompanhar/[código]`, `/minha-conta/*` | Clientes |
| Super Admin | `/admin/*` | Proprietário e funcionários com permissões |
| Restaurantes | `/parceiro/*` (candidatura em `/parceiro/registo`) | Proprietários, gerentes e operadores de cada loja |
| Entregadores | `/entregador/*` (candidatura em `/entregador/registo`) | Entregadores aprovados |

A plataforma **começa vazia**: não há restaurantes, produtos, clientes, pedidos, avaliações nem estatísticas fictícias. O seed opcional (`npm run db:seed`) cria apenas categorias de cozinha vazias e os registos de configuração (desativados) dos métodos de pagamento.

> Documentação adicional: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md) · [docs/PUBLICACAO.md](docs/PUBLICACAO.md)

## Tecnologias

- **Next.js 15 (App Router) + React 19 + TypeScript**, Server Components e Server Actions
- **Tailwind CSS 4**, componentes próprios acessíveis (sem dependência de biblioteca de UI pesada), ícones `lucide-react`
- **PostgreSQL + Prisma 6** (migrações em `prisma/migrations`)
- **Argon2id** (`@node-rs/argon2`) para palavras-passe; sessões em base de dados com cookie `httpOnly`
- **Zod** para validação no servidor; **sharp** para processamento seguro de imagens
- **Vitest** (testes unitários e de integração contra PostgreSQL real) e **Playwright** (E2E e responsividade)

## Instalação local

Requisitos: Node.js ≥ 20.9 e PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env            # edite DATABASE_URL, DIRECT_URL, APP_URL, SETUP_TOKEN, CRON_SECRET
npm run db:migrate              # aplica as migrações
npm run db:seed                 # opcional: categorias de cozinha vazias (sem dados comerciais)
npm run dev                     # http://localhost:3000
```

## Criar a conta do proprietário (Super Admin)

Não existem credenciais administrativas fixas. O registo público nunca cria administradores.

**Opção A — no navegador:** defina `SETUP_TOKEN` (mínimo 16 caracteres, ex.: `openssl rand -base64 24`) nas variáveis de ambiente, abra `/configuracao`, introduza o código e os seus dados (palavra-passe com pelo menos 12 caracteres). A página só funciona enquanto não existir nenhum Super Admin e fica bloqueada depois.

**Opção B — linha de comandos:**

```bash
SETUP_TOKEN=... OWNER_NAME="O Seu Nome" OWNER_EMAIL=voce@exemplo.co.mz OWNER_PHONE=84xxxxxxx OWNER_PASSWORD='...' npm run owner:create
```

Depois de criada a conta, pode remover `SETUP_TOKEN` do ambiente.

## Configuração inicial

Em `/admin/configuracoes/inicial` encontra a lista de passos:

1. **Identidade** — nome, slogan, logótipo e cores (Configurações → Geral). A moeda por omissão é **MZN**, o país **MZ** e o fuso horário **Africa/Maputo**, tudo configurável.
2. **Região** — cidades e bairros atendidos (Configurações → Localizações). Só os bairros listados podem ser escolhidos para entrega.
3. **Contactos** — e-mail, telefone e WhatsApp de suporte.
4. **Taxas** — comissão por omissão, taxa de serviço e parte da taxa de entrega paga ao entregador.
5. **Pagamentos** — ative os métodos disponíveis. Os métodos sem credenciais no servidor não podem ser ativados.
6. **Integrações** — verifique o estado de cada serviço externo.

## Adicionar o primeiro restaurante

**Como administrador:** em `/admin/restaurantes/novo`, preencha os dados. Em "Conta do proprietário" pode:
- criar uma conta nova para o dono do restaurante;
- associar uma conta existente (pode ser a sua, se quiser gerir o cardápio diretamente);
- não associar conta por agora.

O restaurante criado pelo admin fica aprovado. **Por candidatura:** o dono cria conta e preenche `/parceiro/registo`. A candidatura fica pendente até a aprovar em `/admin/restaurantes/[id]`.

## Adicionar o primeiro produto

No painel do restaurante (`/parceiro`):
1. **Categorias** (opcional): por exemplo, "Pratos principais" e "Bebidas".
2. **Cardápio → Novo produto**: nome, descrição, preço, fotografia (JPG/PNG/WebP até 8 MB, convertida para WebP e sem metadados), categoria, variantes ("Tamanho": mínimo 1, máximo 1) e complementos ("Extras": mínimo 0, máximo N).
3. **Horários** e **Zonas de entrega** (bairros com taxa e tempo estimado).

O restaurante só aparece aos clientes quando estiver **aprovado** e tiver **horário**, **pelo menos uma zona de entrega** e **pelo menos um produto ativo**. O painel mostra o que falta.

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run db:migrate` | Aplica migrações (`prisma migrate deploy`) |
| `npm run db:seed` | Seed técnico (sem dados comerciais) |
| `npm run owner:create` | Cria o Super Admin pela linha de comandos |
| `npm run verify` | Lint + verificação de tipos + testes unitários/integração |
| `npm test` | Vitest contra a base de dados de testes (`TEST_DATABASE_URL`) |
| `npm run test:e2e` | Playwright: fluxo completo e responsividade (base de dados `E2E_DATABASE_URL`) |

Os testes usam **exclusivamente** bases de dados de teste: o nome tem de conter `test` (Vitest) ou `e2e` (Playwright), caso contrário os scripts recusam-se a correr. Os dados sintéticos nunca entram na base de dados comercial.

## Variáveis de ambiente

Ver [`.env.example`](.env.example). Resumo:

| Variável | Obrigatória | Função |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | sim | PostgreSQL (URL com pooling e URL direta para migrações) |
| `APP_URL` | sim | URL pública (e-mails, sitemap, Open Graph) |
| `CRON_SECRET` | sim | Protege `/api/cron/maintenance` |
| `SETUP_TOKEN` | só no arranque | Criação da conta do proprietário |
| `RESEND_API_KEY`, `EMAIL_FROM` | não | E-mail transacional (Resend) |
| `BLOB_READ_WRITE_TOKEN` | não | Imagens públicas no Vercel Blob (sem isto ficam na base de dados) |
| `MPESA_*` | não | Credenciais M-Pesa (ver [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md)) |

Nenhuma credencial é enviada para o navegador e o ficheiro `.env` está no `.gitignore`.

## Estado das integrações

| Integração | Estado |
|---|---|
| Pagamento em numerário na entrega | **Implementado e testado.** Confirmado por quem entrega. |
| M-Pesa (Vodacom Moçambique) | **Implementado, não testado contra a API real.** C2B, consulta de estado e reversão (API IPG v1x). Falta pôr as credenciais e validar os endpoints no portal oficial. |
| e-Mola (Movitel) | **Estrutura apenas.** Não existe documentação pública: é preciso um contrato com a Movitel. Permanece desativado. |
| Cartões bancários | **Estrutura apenas.** Falta escolher o gateway. Permanece desativado. |
| E-mail (Resend) | Implementado. Inativo até haver `RESEND_API_KEY`; os envios ficam registados como "não configurado". |
| Imagens (Vercel Blob) | Implementado e opcional. Por omissão, as imagens são guardadas na base de dados. |
| Mapas / GPS | Localização do navegador (com consentimento) e links para o Google Maps. **Não há mapa interativo nem simulação de movimento.** |
| Push / SMS | Não implementado. Há notificações dentro do site e por e-mail. |
| Monitorização de erros | Erros registados na tabela `ErrorLog` (Admin → Auditoria → Erros) e nos logs da Vercel. Sem Sentry. |
