/**
 * Modelos de documentos legais. São pontos de partida que DEVEM ser revistos por um jurista
 * antes da publicação; não constituem garantia de conformidade legal.
 */
export function defaultTerms(platform: string, company: string) {
  return `# Termos de utilização (modelo para revisão jurídica)

Este documento é um modelo e deve ser revisto e adaptado por um profissional jurídico antes de ser utilizado.

# 1. Objeto
A ${platform}, operada por ${company}, disponibiliza uma plataforma que liga clientes a restaurantes parceiros e, quando aplicável, a entregadores independentes, para encomenda e entrega de refeições.

# 2. Conta
O utilizador é responsável pela veracidade dos dados fornecidos e pela confidencialidade da sua palavra-passe. Podemos suspender contas em caso de utilização fraudulenta ou contrária a estes termos.

# 3. Pedidos e preços
Os preços, descrições e disponibilidade dos produtos são definidos pelos restaurantes parceiros. O valor final é apresentado antes da confirmação do pedido e inclui, quando aplicável, taxa de entrega e taxa de serviço.

# 4. Pagamentos
Os pagamentos online são processados por fornecedores de pagamento autorizados. Um pedido pago online só é enviado ao restaurante após confirmação do pagamento pelo fornecedor.

# 5. Cancelamentos e reembolsos
O cliente pode cancelar o pedido antes de o restaurante o aceitar. Pedidos pagos que sejam cancelados ou recusados são reembolsados pelo mesmo meio de pagamento, sempre que possível.

# 6. Responsabilidade
Os restaurantes são responsáveis pela qualidade e segurança alimentar dos produtos. A plataforma atua como intermediária, nos termos da legislação aplicável na República de Moçambique.

# 7. Contactos e reclamações
Pode contactar-nos através da página de ajuda. As reclamações são tratadas pela nossa equipa de suporte.

# 8. Lei aplicável
Estes termos regem-se pela lei da República de Moçambique.`;
}

export function defaultPrivacy(platform: string, company: string) {
  return `# Política de privacidade (modelo para revisão jurídica)

Este documento é um modelo e deve ser revisto e adaptado por um profissional jurídico antes de ser utilizado.

# 1. Responsável pelo tratamento
${company}, operadora da plataforma ${platform}.

# 2. Dados recolhidos
Nome, e-mail, telefone, endereços de entrega, histórico de pedidos e, para entregadores e restaurantes, documentos de identificação e dados necessários à operação e liquidação.

# 3. Localização
A localização do dispositivo só é recolhida com a sua autorização explícita: para clientes, de forma opcional no checkout; para entregadores, apenas durante entregas ativas. Pode retirar a autorização nas definições do navegador a qualquer momento.

# 4. Finalidades
Processar pedidos e entregas, pagamentos, suporte ao cliente, prevenção de fraude e cumprimento de obrigações legais.

# 5. Partilha
Partilhamos com o restaurante e o entregador apenas os dados necessários à preparação e entrega do pedido (nome, telefone, endereço e referência). Fornecedores de pagamento recebem os dados necessários à transação. Nunca guardamos dados completos de cartões bancários.

# 6. Conservação
Os dados de conta são conservados enquanto a conta estiver ativa. Ao encerrar a conta, os dados pessoais são anonimizados; os registos de pedidos são conservados pelo período exigido pelas obrigações fiscais e contabilísticas aplicáveis.

# 7. Direitos
Pode aceder, retificar e pedir a eliminação dos seus dados na área "Minha conta" ou através do suporte.

# 8. Segurança
As palavras-passe são guardadas com hashing seguro (Argon2id), as comunicações são cifradas (HTTPS) e os documentos privados só são acessíveis a pessoal autorizado.`;
}
