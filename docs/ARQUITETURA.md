# Arquitetura

## Organização do código

```
prisma/schema.prisma        Esquema da base de dados (PostgreSQL)
prisma/migrations/          Migrações versionadas
src/server/                 Código exclusivo do servidor
  services/                 Regras de negócio (testáveis, sem dependência do Next.js)
    orders.ts               Checkout e motor de pedidos
    order-state.ts          Máquina de estados
    payments.ts             Pagamentos, webhooks, reconciliação, reembolsos
    deliveries.ts           Despacho e entregas
    pricing.ts              Preços, cupões, taxas e comissões
    finance.ts              Indicadores, saldos, liquidações, exportação
    ...
  payments/                 Adaptadores de fornecedores de pagamento
  auth/                     Palavras-passe, sessões, tokens
  authz.ts / permissions.ts Autorização por função
  storage/files.ts          Upload e acesso a ficheiros
src/app/                    Rotas (páginas, Server Actions, APIs)
src/components/             Componentes de interface
tests/                      Vitest (unit/integração) e Playwright (e2e)
```

As Server Actions (`src/app/**/actions.ts`) são finas: autenticam, chamam um serviço e revalidam a interface. **Toda a validação e autorização acontece nos serviços**, que recebem o `userId` e verificam permissões na base de dados. Por isso, os testes de integração validam a segurança diretamente nos serviços.

## Base de dados (resumo)

- **Acesso:** `User`, `Session`, `PasswordResetToken`, `StaffMember` (funcionários: Operações, Financeiro, Suporte, Gestão de restaurantes), `RestaurantMember` (Proprietário, Gerente, Operador), `RateLimit`, `AuditLog`, `ErrorLog`.
- **Configuração:** `PlatformSettings` (linha única), `City`, `Neighborhood`, `CuisineCategory`, `PaymentProviderConfig`.
- **Restaurantes:** `Restaurant`, `RestaurantHour`, `DeliveryZone` (bairro + taxa + tempo), `CommissionRule` (com data de início e histórico), `RestaurantDocument`.
- **Cardápio:** `MenuCategory`, `Product`, `OptionGroup`, `Option`.
- **Clientes:** `Address`, `Favorite`, `Cart`/`CartItem` (sacola guardada no servidor, partilhada entre dispositivos), `Review`, `Notification`.
- **Pedidos:** `Order` (com instantâneo do endereço, valores e comissão no momento do pedido), `OrderItem` (instantâneo de nome, preço e opções), `OrderStatusEvent` (histórico).
- **Pagamentos:** `Payment`, `PaymentEvent`, `WebhookEvent` (idempotência), `Refund`.
- **Entregas:** `Courier`, `CourierDocument`, `Delivery`, `DeliveryOffer`, `DeliveryIssue`, `CourierPayout`.
- **Finanças e marketing:** `Settlement`, `Coupon`, `CouponRedemption`, `Campaign`, `Banner`.
- **Suporte:** `SupportTicket`, `TicketMessage`.
- **Ficheiros:** `StoredFile` (público ou privado).

Os valores monetários são inteiros em centavos e cada pedido guarda a sua moeda.

## Máquina de estados dos pedidos

```
PENDING_PAYMENT ──(pagamento confirmado pelo fornecedor)──▶ PLACED
PENDING_PAYMENT ──(cliente / expiração / admin)──▶ CANCELLED
PLACED ──restaurante──▶ ACCEPTED | REJECTED (com motivo)
PLACED ──cliente (antes de aceitar) / admin──▶ CANCELLED
ACCEPTED ──▶ PREPARING ──▶ READY_FOR_PICKUP
ACCEPTED|PREPARING ──restaurante/admin (motivo)──▶ CANCELLED
READY_FOR_PICKUP ──▶ PICKED_UP ──▶ IN_TRANSIT ──▶ DELIVERED
   (entregador atribuído no modelo PLATFORM; restaurante no modelo RESTAURANT)
READY_FOR_PICKUP|PICKED_UP|IN_TRANSIT ──admin (motivo)──▶ CANCELLED
```

- Os pedidos pagos na entrega entram diretamente em `PLACED`; os pagos online só passam a `PLACED` depois de o fornecedor confirmar o pagamento.
- Cada transição é validada (`order-state.ts`), autorizada por função e aplicada com uma **atualização condicional sobre o estado anterior**. Duas ações simultâneas nunca aplicam ambas, e o teste "transições simultâneas" verifica isto.
- `DELIVERED`, `REJECTED` e `CANCELLED` são estados finais. Um pedido não pode ser entregue duas vezes.
- Os reembolsos seguem o estado de pagamento: cancelar ou recusar um pedido pago cria um `Refund` pendente e marca `paymentStatus = REFUND_PENDING`.
- Ao cancelar, a utilização do cupão é anulada e a entrega e as ofertas são canceladas.
- Os pedidos online sem pagamento expiram ao fim de `paymentTimeoutMinutes` (tarefa periódica). Se o pagamento chegar depois disso, é criado um reembolso automaticamente.

## Modelos de entrega

- **RESTAURANT:** o restaurante entrega e marca recolha/entrega no painel; a taxa de entrega entra no valor líquido do restaurante.
- **PLATFORM:** quando o restaurante aceita o pedido, é criada uma `Delivery` e enviadas ofertas aos entregadores aprovados, disponíveis, da mesma cidade e sem entrega ativa. A aceitação é atómica (só um entregador fica com a entrega). As ofertas expiram (`deliveryOfferTimeoutSec`) e a tarefa periódica reenvia-as e alerta a equipa de operações quando ninguém aceita. O admin pode atribuir ou libertar entregas manualmente.

## Modelo financeiro

Por pedido, calculado no servidor no momento da criação:

- `total = subtotal − desconto + taxa de entrega + taxa de serviço`
- `comissão = (subtotal − desconto do restaurante) × % + valor fixo` (regra em vigor nesse momento)
- `líquido do restaurante = subtotal − desconto do restaurante − comissão (+ taxa de entrega, se o restaurante entregar)`
- `valor do entregador = máx(valor mínimo, taxa de entrega × %)` no modelo PLATFORM

Receita efetiva da plataforma (apenas pedidos **entregues e pagos**): comissões + taxas de serviço + margem de entrega − descontos financiados pela plataforma.

**Liquidações:** o saldo de um restaurante soma o líquido dos pedidos em que a plataforma recebeu o dinheiro (online, ou numerário recolhido por entregador da plataforma) e subtrai a parte da plataforma nos pedidos em que o restaurante recebeu numerário. Cada liquidação associa os pedidos incluídos (sem dupla contagem) e só é marcada como paga com a referência da transferência, feita fora do sistema. **A plataforma não assume que o M-Pesa divide pagamentos automaticamente.**

## Segurança

- Argon2id; sessões aleatórias de 256 bits guardadas como hash SHA-256; cookies `httpOnly`, `SameSite=Lax`, `Secure` em produção.
- Autorização sempre no servidor. O restaurante ativo é validado contra as associações do utilizador; os IDs enviados pelo navegador são sempre verificados contra o restaurante ou o cliente.
- Permissões privilegiadas (configurações, funcionários, comissões, auditoria) são exclusivas do Super Admin. O registo público ignora quaisquer campos de função.
- O painel administrativo tem login próprio (`/admin/login`). Sem sessão, o middleware envia para esse login; com sessão sem permissões administrativas, para `/admin/sem-acesso`.
- A equipa com `restaurants.manage` (Super Admin e "Gestão de restaurantes") pode gerir o cardápio e a loja de qualquer restaurante a partir do Admin (`assertRestaurantAccess`). Pedidos, equipa, liquidações e promoções do restaurante continuam reservados aos membros do restaurante.
- Proteção CSRF: Server Actions com verificação de origem nativa do Next.js; a API de localização verifica `Origin`; cookies `SameSite=Lax`.
- Limitação de tentativas (login, registo, recuperação, tickets, configuração) guardada em PostgreSQL, para funcionar entre instâncias serverless.
- Uploads: validação por assinatura de bytes (não por extensão), limites de tamanho, re-codificação das imagens (remove EXIF/GPS) e documentos privados servidos apenas após verificação de permissões, com `Content-Security-Policy: sandbox`.
- Sem SQL dinâmico com dados do utilizador (Prisma com parâmetros); o React escapa todo o texto e os documentos legais são renderizados sem HTML.
- Exportação CSV protegida contra injeção de fórmulas.
- Cabeçalhos: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Auditoria das ações administrativas, de aprovação, financeiras e de segurança.

## Tempo real

As atualizações usam **polling eficiente**: o painel de pedidos a cada 10 s, o acompanhamento do cliente a cada 20 s, as ofertas do entregador a cada 8 s. O polling só corre com a página visível. É compatível com hospedagem serverless (Vercel), sem servidor de WebSockets.

## Decisões técnicas relevantes

- **Sem `loading.tsx` na raiz:** um Suspense global impedia em produção a conclusão das atualizações depois de Server Actions (bug do Next.js 15 detetado nos testes E2E). O feedback de carregamento é dado nos botões e formulários.
- **Formulários sem reset automático:** as Server Actions são chamadas a partir do `onSubmit` (`useServerForm`), para não apagar o que o utilizador escreveu quando há erros de validação, e com proteção contra cliques repetidos.
- **Uma sacola por restaurante:** ao adicionar um produto de outro restaurante, o cliente tem de confirmar a substituição.
