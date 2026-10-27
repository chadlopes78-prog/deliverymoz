import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getSettingsUncached } from "@/server/services/settings";
import { providerStatusList } from "@/server/services/admin";
import { integrationStatus } from "@/server/integrations";
import { PageHeader } from "@/components/ui/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { completeSetupAction } from "@/app/admin/actions";

export const metadata = { title: "Configuração inicial" };

export default async function InitialSetup() {
  await requireAdmin("settings.manage");
  const [s, cities, providers] = await Promise.all([getSettingsUncached(), db.city.count({ where: { isActive: true, neighborhoods: { some: { isActive: true } } } }), providerStatusList()]);
  const integrations = integrationStatus();
  const steps = [
    { done: true, title: "Conta do proprietário criada", href: null, text: "Já tem acesso total à plataforma." },
    { done: s.platformName !== "DeliveryMoz" || !!s.tagline || !!s.logoFileId, title: "Identidade: nome, logótipo e cores", href: "/admin/configuracoes?tab=geral", text: `Nome atual: ${s.platformName}. Moeda: ${s.currency}. País: ${s.countryCode}.` },
    { done: cities > 0, title: "Região inicial: cidades e bairros atendidos", href: "/admin/configuracoes?tab=localizacoes", text: "Obrigatório: pelo menos uma cidade com bairros." },
    { done: !!(s.supportEmail || s.supportPhone), title: "Contactos oficiais", href: "/admin/configuracoes?tab=contactos", text: "Apresentados na ajuda e no rodapé." },
    { done: true, title: "Taxas e comissão", href: "/admin/configuracoes?tab=taxas", text: `Comissão por omissão: ${s.defaultCommissionBps / 100}%. Taxa de serviço: ${s.serviceFeeBps / 100}%.` },
    { done: providers.some((p) => p.enabled), title: "Métodos de pagamento", href: "/admin/configuracoes?tab=pagamentos", text: "Ative pelo menos um método. Métodos sem credenciais permanecem desativados." },
    { done: integrations.filter((i) => i.required).every((i) => i.configured), title: "Serviços externos", href: "/admin/configuracoes?tab=integracoes", text: `${integrations.filter((i) => i.configured).length} de ${integrations.length} integrações configuradas.` },
  ];
  return (
    <>
      <PageHeader title="Configuração inicial" description="Prepare a plataforma para receber os seus restaurantes e produtos. Nenhum fornecedor é obrigatório para abrir o site." />
      <ol className="space-y-3">
        {steps.map((st) => (
          <li key={st.title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            {st.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
            <div className="min-w-0 flex-1"><p className="font-semibold">{st.title}</p><p className="text-sm text-muted">{st.text}</p></div>
            {st.href && <Link href={st.href} className="shrink-0 text-sm font-semibold text-brand">Configurar</Link>}
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm">
        <p className="font-semibold">Próximos passos depois da configuração</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Em <Link className="text-brand" href="/admin/restaurantes/novo">Restaurantes → Adicionar</Link>, crie o primeiro restaurante (pode associá-lo à sua própria conta).</li>
          <li>Abra o <Link className="text-brand" href="/parceiro">painel do restaurante</Link> e adicione categorias, produtos, horários e zonas de entrega.</li>
          <li>O restaurante aparece publicamente quando tiver horário, zonas de entrega e pelo menos um produto ativo.</li>
        </ol>
      </div>
      {!s.setupCompletedAt ? (
        <ActionForm action={completeSetupAction} className="mt-6"><SubmitButton size="lg">Concluir configuração inicial</SubmitButton></ActionForm>
      ) : <p className="mt-6 text-sm text-accent">Configuração inicial concluída.</p>}
    </>
  );
}
