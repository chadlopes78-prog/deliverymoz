import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getSettingsUncached } from "@/server/services/settings";
import { providerStatusList } from "@/server/services/admin";
import { integrationStatus } from "@/server/integrations";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { centsToInput } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";
import { defaultPrivacy, defaultTerms } from "@/lib/legal";
import { settingsAction, cityAction, neighborhoodsAction, neighborhoodToggleAction, cuisineAction, providerAction } from "@/app/admin/actions";

export const metadata = { title: "Configurações" };

const pctStr = (bps: number) => String(bps / 100);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "geral" } = await searchParams;
  await requireAdmin("settings.manage");
  const s = await getSettingsUncached();
  return (
    <>
      <PageHeader title="Configurações" description="Configurações globais da plataforma." />
      <Tabs base="/admin/configuracoes" current={tab} tabs={[["geral", "Geral"], ["contactos", "Contactos"], ["taxas", "Taxas"], ["regras", "Regras"], ["localizacoes", "Localizações"], ["categorias", "Categorias"], ["pagamentos", "Pagamentos"], ["integracoes", "Integrações"], ["legal", "Legal"]]} />

      {tab === "geral" && (
        <Card><CardBody>
          <ActionForm action={settingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="section" value="general" />
            <Field label="Nome da plataforma" htmlFor="platformName"><Input id="platformName" name="platformName" defaultValue={s.platformName} required /></Field>
            <Field label="Slogan" htmlFor="tagline"><Input id="tagline" name="tagline" defaultValue={s.tagline ?? ""} /></Field>
            <Field label="Cor principal" htmlFor="primaryColor"><Input id="primaryColor" name="primaryColor" type="color" defaultValue={s.primaryColor} className="h-11 p-1" /></Field>
            <Field label="Cor secundária" htmlFor="accentColor"><Input id="accentColor" name="accentColor" type="color" defaultValue={s.accentColor} className="h-11 p-1" /></Field>
            <Field label="Moeda (ISO 4217)" htmlFor="currency" hint="MZN por omissão. Alterar a moeda não converte valores existentes."><Input id="currency" name="currency" defaultValue={s.currency} required maxLength={3} /></Field>
            <Field label="País (ISO)" htmlFor="countryCode"><Input id="countryCode" name="countryCode" defaultValue={s.countryCode} required maxLength={2} /></Field>
            <Field label="Idioma/formato" htmlFor="locale"><Input id="locale" name="locale" defaultValue={s.locale} required /></Field>
            <Field label="Fuso horário" htmlFor="timezone"><Input id="timezone" name="timezone" defaultValue={s.timezone} required /></Field>
            <Field label="Domínio público (URL)" htmlFor="siteUrl" hint="Ex.: https://www.exemplo.co.mz — usado em SEO e e-mails"><Input id="siteUrl" name="siteUrl" type="url" defaultValue={s.siteUrl ?? ""} /></Field>
            <Field label="Logótipo" htmlFor="logo">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.logoFileId && <img src={fileUrl(s.logoFileId)!} alt="Logótipo atual" className="h-11 w-11 rounded-xl object-cover" />}
                <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" />
              </div>
              {s.logoFileId && <Checkbox name="removeLogo" label="Remover logótipo" className="mt-2" />}
            </Field>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody></Card>
      )}

      {tab === "contactos" && (
        <Card><CardBody>
          <ActionForm action={settingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="section" value="contacts" />
            <Field label="E-mail de suporte" htmlFor="supportEmail"><Input id="supportEmail" name="supportEmail" type="email" defaultValue={s.supportEmail ?? ""} /></Field>
            <Field label="Telefone de suporte" htmlFor="supportPhone"><Input id="supportPhone" name="supportPhone" defaultValue={s.supportPhone ?? ""} /></Field>
            <Field label="WhatsApp" htmlFor="whatsapp"><Input id="whatsapp" name="whatsapp" defaultValue={s.whatsapp ?? ""} /></Field>
            <Field label="Denominação social" htmlFor="companyLegalName"><Input id="companyLegalName" name="companyLegalName" defaultValue={s.companyLegalName ?? ""} /></Field>
            <Field label="Morada da empresa" htmlFor="companyAddress" className="sm:col-span-2"><Input id="companyAddress" name="companyAddress" defaultValue={s.companyAddress ?? ""} /></Field>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody></Card>
      )}

      {tab === "taxas" && (
        <Card><CardBody>
          <ActionForm action={settingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="section" value="fees" />
            <Field label="Taxa de serviço ao cliente (%)" htmlFor="serviceFeePct"><Input id="serviceFeePct" name="serviceFeePct" inputMode="decimal" defaultValue={pctStr(s.serviceFeeBps)} /></Field>
            <Field label={`Taxa de serviço fixa (${s.currency})`} htmlFor="serviceFeeFixed"><Input id="serviceFeeFixed" name="serviceFeeFixed" inputMode="decimal" defaultValue={centsToInput(s.serviceFeeFixedCents)} /></Field>
            <Field label={`Taxa de serviço máxima (${s.currency})`} htmlFor="serviceFeeMax" hint="Vazio = sem limite"><Input id="serviceFeeMax" name="serviceFeeMax" inputMode="decimal" defaultValue={centsToInput(s.serviceFeeMaxCents)} /></Field>
            <Field label="Comissão por omissão (%)" htmlFor="defaultCommissionPct" hint="Usada quando não existe regra em Comissões"><Input id="defaultCommissionPct" name="defaultCommissionPct" inputMode="decimal" defaultValue={pctStr(s.defaultCommissionBps)} /></Field>
            <Field label="Parte da taxa de entrega paga ao entregador (%)" htmlFor="courierSharePct"><Input id="courierSharePct" name="courierSharePct" inputMode="decimal" defaultValue={pctStr(s.courierFeeShareBps)} /></Field>
            <Field label={`Valor mínimo por entrega ao entregador (${s.currency})`} htmlFor="courierBaseFee"><Input id="courierBaseFee" name="courierBaseFee" inputMode="decimal" defaultValue={centsToInput(s.courierBaseFeeCents)} /></Field>
            <p className="text-xs text-muted sm:col-span-2">As taxas de entrega por bairro são definidas por cada restaurante nas suas zonas de entrega.</p>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody></Card>
      )}

      {tab === "regras" && (
        <Card><CardBody>
          <ActionForm action={settingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="section" value="rules" />
            <Field label="Prazo para aceitar ofertas de entrega (segundos)" htmlFor="deliveryOfferTimeoutSec"><Input id="deliveryOfferTimeoutSec" name="deliveryOfferTimeoutSec" type="number" min={20} max={900} defaultValue={s.deliveryOfferTimeoutSec} /></Field>
            <Field label="Prazo para concluir pagamentos online (minutos)" htmlFor="paymentTimeoutMinutes"><Input id="paymentTimeoutMinutes" name="paymentTimeoutMinutes" type="number" min={5} max={240} defaultValue={s.paymentTimeoutMinutes} /></Field>
            <Field label="Cancelamento pelo cliente" htmlFor="customerCancelWindow"><Select id="customerCancelWindow" name="customerCancelWindow" defaultValue={s.customerCancelWindow}><option value="BEFORE_ACCEPT">Permitido antes de o restaurante aceitar</option><option value="NEVER">Apenas através do suporte</option></Select></Field>
            <Field label="Política de cancelamento (texto)" htmlFor="cancellationPolicy" className="sm:col-span-2"><Textarea id="cancellationPolicy" name="cancellationPolicy" defaultValue={s.cancellationPolicy ?? ""} /></Field>
            <div className="space-y-2 sm:col-span-2">
              <Checkbox name="registrationOpen" defaultChecked={s.registrationOpen} label="Registo de clientes aberto" />
              <Checkbox name="partnerSignupOpen" defaultChecked={s.partnerSignupOpen} label="Candidaturas de restaurantes abertas" />
              <Checkbox name="courierSignupOpen" defaultChecked={s.courierSignupOpen} label="Candidaturas de entregadores abertas" />
              <Checkbox name="emailNotificationsOn" defaultChecked={s.emailNotificationsOn} label="Enviar notificações por e-mail (quando configurado)" />
            </div>
            <div className="sm:col-span-2"><SubmitButton>Guardar</SubmitButton></div>
          </ActionForm>
        </CardBody></Card>
      )}

      {tab === "localizacoes" && <Locations />}
      {tab === "categorias" && <Cuisines />}
      {tab === "pagamentos" && <Payments />}
      {tab === "integracoes" && <Integrations />}

      {tab === "legal" && (
        <Card><CardHeader title="Documentos legais" description="Modelos para revisão jurídica. Use '# ' no início de uma linha para títulos. Deixe vazio para usar o modelo por omissão." /><CardBody>
          <ActionForm action={settingsAction} className="space-y-4">
            <input type="hidden" name="section" value="legal" />
            <Field label="Termos de utilização" htmlFor="termsContent"><Textarea id="termsContent" name="termsContent" defaultValue={s.termsContent ?? defaultTerms(s.platformName, s.companyLegalName || s.platformName)} className="min-h-72 font-mono text-xs" /></Field>
            <Field label="Política de privacidade" htmlFor="privacyContent"><Textarea id="privacyContent" name="privacyContent" defaultValue={s.privacyContent ?? defaultPrivacy(s.platformName, s.companyLegalName || s.platformName)} className="min-h-72 font-mono text-xs" /></Field>
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </CardBody></Card>
      )}
    </>
  );
}

async function Locations() {
  const cities = await db.city.findMany({ orderBy: { name: "asc" }, include: { neighborhoods: { orderBy: { name: "asc" } } } });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Adicionar cidade atendida" description="Indique os bairros separados por vírgulas ou em linhas. Só os bairros listados podem ser escolhidos para entrega." />
        <CardBody>
          <ActionForm action={cityAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Cidade" htmlFor="cname"><Input id="cname" name="name" required placeholder="Ex.: Maputo" /></Field>
            <Field label="Bairros" htmlFor="cnbs"><Textarea id="cnbs" name="neighborhoods" className="min-h-11" placeholder="Ex.: Polana Cimento, Sommerschield, Malhangalene" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Adicionar</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      {cities.map((c) => (
        <Card key={c.id}>
          <CardHeader title={c.name} description={`${c.neighborhoods.filter((n) => n.isActive).length} bairros ativos`} action={<QuickAction action={cityAction} hidden={{ id: c.id, name: c.name, isActive: c.isActive ? "false" : "true" }} label={c.isActive ? "Desativar cidade" : "Ativar cidade"} />} />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {c.neighborhoods.map((n) => (
                <ActionForm key={n.id} action={neighborhoodToggleAction} hideMessage>
                  <input type="hidden" name="id" value={n.id} /><input type="hidden" name="isActive" value={n.isActive ? "false" : "true"} />
                  <button className={n.isActive ? "rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent" : "rounded-full bg-ink/5 px-3 py-1 text-sm text-muted line-through"} title={n.isActive ? "Clique para desativar" : "Clique para ativar"}>{n.name}</button>
                </ActionForm>
              ))}
            </div>
            <ActionForm action={neighborhoodsAction} resetOnSuccess className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="cityId" value={c.id} />
              <Input name="names" required placeholder="Novos bairros (separados por vírgulas)" aria-label="Novos bairros" />
              <SubmitButton variant="outline">Adicionar bairros</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

async function Cuisines() {
  const list = await db.cuisineCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { restaurants: true } } } });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Nova categoria de cozinha" description="Usadas na pesquisa e nos filtros. Só aparecem ao público quando têm restaurantes." />
        <CardBody>
          <ActionForm action={cuisineAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
            <Field label="Nome" htmlFor="cu-name" className="sm:col-span-2"><Input id="cu-name" name="name" required /></Field>
            <Field label="Emoji" htmlFor="cu-emoji"><Input id="cu-emoji" name="emoji" maxLength={4} /></Field>
            <Field label="Ordem" htmlFor="cu-pos"><Input id="cu-pos" name="position" type="number" defaultValue={0} /></Field>
            <div className="sm:col-span-4"><SubmitButton>Adicionar</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <span>{c.emoji} {c.name} <span className="text-muted">({c._count.restaurants})</span></span>
            <QuickAction action={cuisineAction} hidden={{ id: c.id, name: c.name, emoji: c.emoji ?? "", position: String(c.position), isActive: c.isActive ? "false" : "true" }} label={c.isActive ? "Ativa" : "Inativa"} variant={c.isActive ? "outline" : "ghost"} />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Payments() {
  const providers = await providerStatusList();
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-ink/5 p-3 text-sm text-muted">As credenciais dos fornecedores são definidas apenas nas variáveis de ambiente do servidor e nunca são mostradas aqui. Um método só pode ser ativado quando a sua configuração está completa.</p>
      {providers.map((p) => (
        <Card key={p.key}>
          <CardHeader title={p.displayName} description={p.note} action={<div className="flex gap-2"><Badge tone={p.configured ? "green" : "yellow"}>{p.configured ? "Configurado" : "Por configurar"}</Badge><Badge tone={p.enabled ? "green" : "neutral"}>{p.enabled ? "Ativo" : "Inativo"}</Badge></div>} />
          <CardBody>
            {!p.configured && <p className="mb-3 text-sm text-amber-800">Em falta: {p.missing.join(", ")}</p>}
            <ActionForm action={providerAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="key" value={p.key} />
              <Field label="Nome apresentado ao cliente" htmlFor={`dn-${p.key}`}><Input id={`dn-${p.key}`} name="displayName" defaultValue={p.displayName} /></Field>
              {p.kind === "ONLINE" && <Field label="Modo" htmlFor={`m-${p.key}`}><Select id={`m-${p.key}`} name="mode" defaultValue={p.mode}><option value="SANDBOX">Testes (sandbox)</option><option value="LIVE">Produção</option></Select></Field>}
              <Field label="Instruções ao cliente" htmlFor={`in-${p.key}`} className="sm:col-span-2"><Input id={`in-${p.key}`} name="instructions" defaultValue={p.instructions ?? ""} placeholder={p.key === "CASH_ON_DELIVERY" ? "Ex.: tenha o valor certo" : ""} /></Field>
              <Checkbox name="enabled" defaultChecked={p.storedEnabled} disabled={!p.configured} label="Ativar este método" className="sm:col-span-2" />
              <div className="sm:col-span-2"><SubmitButton size="sm">Guardar</SubmitButton></div>
            </ActionForm>
            {p.key === "MPESA" && <p className="mt-3 text-xs text-muted">O modo (sandbox/produção) usado nas chamadas é definido pela variável MPESA_ENV no servidor. Webhooks: a API C2B do M-Pesa Moçambique é síncrona; estados incertos são reconciliados automaticamente pela tarefa periódica.</p>}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function Integrations() {
  const list = integrationStatus();
  return (
    <ul className="space-y-2">
      {list.map((i) => (
        <li key={i.key} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{i.name} {i.required && <span className="text-xs text-muted">(obrigatório)</span>}</p><p className="text-muted">{i.note}</p></div>
          <Badge tone={i.configured ? "green" : i.required ? "red" : "yellow"}>{i.configured ? "Configurado" : "Não configurado"}</Badge>
        </li>
      ))}
    </ul>
  );
}
