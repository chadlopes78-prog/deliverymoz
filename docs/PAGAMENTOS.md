# Pagamentos

## Camada de abstração

Cada fornecedor implementa a interface `PaymentProvider` (`src/server/payments/types.ts`):

- `missingConfig()`: variáveis em falta. Um método só pode ser ativado com a lista vazia.
- `initiate()`: cria a cobrança.
- `queryStatus()`: consulta o estado, usada na reconciliação.
- `refund()`: reembolso pelo fornecedor, quando suportado.
- `parseWebhook()`: valida a assinatura e interpreta o evento, quando o fornecedor envia webhooks.

Para adicionar um fornecedor, cria-se um adaptador e regista-se em `src/server/payments/registry.ts`. O checkout não precisa de alterações.

### Regras comuns (todas testadas)

- O pedido online fica em `PENDING_PAYMENT` e só passa a `PLACED` quando **o servidor recebe a confirmação do fornecedor** (resposta HTTPS, consulta de estado ou webhook com assinatura válida). Os redirecionamentos do navegador nunca confirmam pagamentos.
- `applyProviderOutcome` é **idempotente**: o mesmo resultado aplicado várias vezes produz um único efeito.
- Webhooks: a assinatura é validada pelo adaptador; os eventos repetidos são ignorados (chave única `fornecedor + id do evento`); os inválidos são rejeitados (401) e registados.
- Timeout ou falha de rede deixam o pagamento em `PROCESSING` (incerto), nunca em "pago" nem em "falhado". A tarefa periódica consulta o estado.
- Cada nova tentativa usa uma referência nova.
- O pagamento recebido depois de o pedido ter sido cancelado gera automaticamente um reembolso pendente.
- Estados suportados: pendente, em processamento, pago, falhado, cancelado, reembolso pendente, reembolsado, parcialmente reembolsado.
- Nunca são guardados dados de cartões.

## M-Pesa (Vodacom Moçambique)

**Estado:** implementado; **não testado contra a API real** (não existem credenciais neste ambiente).

O portal oficial `https://developer.mpesa.vm.co.mz/` exige registo para consultar a documentação. Os endpoints implementados coincidem entre bibliotecas comunitárias independentes (`@paymentsds/mpesa`, `mpesa-mz-nodejs-lib`):

| Operação | Pedido |
|---|---|
| C2B (cliente paga) | `POST https://{host}:18352/ipg/v1x/c2bPayment/singleStage/` |
| Consulta de estado | `GET https://{host}:18353/ipg/v1x/queryTransactionStatus/` |
| Reversão (reembolso) | `PUT https://{host}:18354/ipg/v1x/reversal/` |

Anfitriões: `api.sandbox.vm.co.mz` (testes) e `api.mpesa.vm.co.mz` (produção). Autenticação: `Authorization: Bearer base64(RSA_PKCS1(api_key, public_key))` e cabeçalho `Origin`. O C2B é **síncrono**: a resposta chega depois de o cliente confirmar no telemóvel. `INS-0` significa sucesso; os outros códigos significam falha. **Esta API não envia webhooks.**

### Para ativar

1. Registe-se no portal M-Pesa e obtenha: API Key, Public Key, Service Provider Code (shortcode) e Origin.
2. **Confirme no portal** que os endpoints e portas acima continuam válidos.
3. Defina as variáveis no servidor (Vercel → Settings → Environment Variables):
   `MPESA_ENV=sandbox`, `MPESA_API_KEY`, `MPESA_PUBLIC_KEY`, `MPESA_SERVICE_PROVIDER_CODE`, `MPESA_ORIGIN`.
   Para reembolsos automáticos: `MPESA_INITIATOR_IDENTIFIER` e `MPESA_SECURITY_CREDENTIAL`.
4. Faça um redeploy. Em Admin → Configurações → Pagamentos, o M-Pesa aparece como "Configurado"; ative-o.
5. Teste em sandbox com o número de testes do portal antes de mudar para `MPESA_ENV=live`.
6. A função do checkout espera pela confirmação no telemóvel (até ~90 s). Na Vercel, confirme que a duração máxima das funções do seu plano o permite.

Verificar no portal antes de produção: os valores exatos de `output_ResponseTransactionStatus` na consulta de estado (o código aceita apenas `Completed` como pago) e a lista completa de códigos de erro.

## e-Mola (Movitel)

**Estado:** não implementado, por falta de documentação pública. A integração (serviço USSD Push) é fornecida pela Movitel apenas com contrato. Com a especificação oficial, implementa-se `src/server/payments/others.ts → emolaProvider` (initiate, queryStatus e parseWebhook, se existir). Até lá, o método está bloqueado e não pode ser ativado.

## Cartões bancários

**Estado:** não implementado: o gateway ainda não foi escolhido. Escolha um processador disponível em Moçambique (normalmente através do banco adquirente) com página de pagamento alojada (hosted checkout), para não manipular dados de cartões. Depois, implemente `cardProvider` com webhooks assinados.

## Pagamento na entrega (numerário)

**Estado:** implementado e testado. É ativado em Admin → Pagamentos e por restaurante (Loja → "Aceitar pagamento em numerário"). Quem entrega (o restaurante ou o entregador da plataforma) tem de confirmar "Recebi X MTn" para marcar o pedido como entregue; só então o pagamento fica "pago".

## Reembolsos

Admin → Financeiro → Reembolsos:
- **Via fornecedor:** M-Pesa (reversão), quando configurado.
- **Manual:** quando o reembolso é feito fora do sistema (por exemplo, envio M-Pesa B2C manual), com referência obrigatória.
- **Recusar:** com motivo.
