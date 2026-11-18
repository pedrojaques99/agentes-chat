// Fills a LOCAL dev workspace with busy, worst-case Brazilian Portuguese data (long names, long texts, every status,
// threads, reactions, waiting approvals) so screens can be reviewed the way a real team sees them.
//
//   bun scripts/visant/seed-demo.ts http   <passwordFile> [orgId]   server RUNNING  (agents, people, channels, tasks...)
//   bun scripts/visant/seed-demo.ts engine <pgliteFolder> [orgId]   server STOPPED  (messages, reactions, widgets...)
//
// Why two parts: agents and people cannot post through the HTTP API without a model run, and PGlite is a single
// process, so the engine part opens the data folder itself and must be the only one holding it. Every step skips what
// already exists by name or title, so both parts can be re-run on top of each other.
import { readFileSync } from "node:fs";

const API = process.env.SEED_API ?? "http://localhost:3460";
const ORIGIN = process.env.SEED_ORIGIN ?? "http://localhost:5460";
const DEFAULT_ORG = "53e0391b-a248-47b3-af2a-a1113eba948d";
const OWNER_EMAIL = "dock-test@example.test";
// A fixed local-only password for the demo people; the whole workspace lives in a throwaway local database.
const PEOPLE_PASSWORD = "Demo-Local-Pessoa-2026";
const TZ = "America/Sao_Paulo";

// ── Shared data ───────────────────────────────────────────────────────────────────────────────────────────────────

export const AGENTS = [
  {
    handle: "rollo",
    name: "Rollo · Designer de motion",
    role: "Animações, vinhetas e motion graphics para as redes e o site",
    group: "Design",
    color: "violet",
    eyes: "wide",
  },
  {
    handle: "miguel",
    name: "Miguel · Atendimento WhatsApp",
    role: "Responde clientes no WhatsApp, abre chamados e passa o que for humano",
    group: "Atendimento",
    color: "green",
    eyes: "happy",
  },
  {
    handle: "felix",
    name: "Félix · Web-dev clientes",
    role: "Sites e landing pages dos clientes: Next.js, Tailwind e deploy na Vercel",
    group: "Engenharia",
    color: "sky",
    eyes: "round",
  },
  {
    handle: "ageu",
    name: "Ageu · Engenharia",
    role: "Revisa pull requests, mantém a integração contínua e cuida do banco de dados",
    group: "Engenharia",
    color: "indigo",
    eyes: "dots",
  },
  {
    handle: "norton",
    name: "Norton · Business manager",
    role: "Contratos, cobranças, fluxo de caixa e relatório mensal para os sócios",
    group: "Operações",
    color: "amber",
    eyes: "sleepy",
  },
  {
    handle: "torres",
    name: "Torres · Comercial",
    role: "Prospecção, propostas e acompanhamento de negociações em andamento",
    group: "Comercial",
    color: "rose",
    eyes: "happy",
  },
  {
    handle: "darlan",
    name: "Darlan · Designer Jr",
    role: "Peças de redes sociais, adaptações de formato e organização de arquivos",
    group: "Design",
    color: "teal",
    eyes: "round",
  },
  {
    handle: "helena",
    name: "Helena Albuquerque de Vasconcelos e Souza · Estratégia",
    role: "Planejamento estratégico de marca, pesquisa de mercado, posicionamento, tom de voz, calendário editorial trimestral e acompanhamento de métricas de todas as contas ativas do estúdio",
    group: "Operações",
    color: "graphite",
    eyes: "wide",
  },
] as const;

export const PEOPLE = [
  { name: "Camila Ribeiro", email: "camila.ribeiro@example.test" },
  { name: "Rodrigo Nascimento Figueiredo", email: "rodrigo.nf@example.test" },
  { name: "Ana Beatriz Cavalcanti de Albuquerque Mendonça", email: "ana.beatriz@example.test" },
  { name: "Thiago Moura", email: "thiago.moura@example.test" },
  { name: "Luiza Prado", email: "luiza.prado@example.test" },
] as const;

export const CHANNELS = [
  { name: "design", topic: "Peças, motion e referências visuais. Tudo que vai pro cliente passa por aqui antes." },
  { name: "atendimento", topic: "Fila do WhatsApp, chamados abertos e o que precisa de gente de verdade." },
  {
    name: "engenharia",
    topic: "Pull requests, deploys, incidentes e dívida técnica. Avisem antes de subir em produção.",
  },
  { name: "comercial", topic: "Propostas, negociações e metas do trimestre. Atualizar o funil toda sexta." },
] as const;

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const ISSUES: {
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "normal" | "high";
  assignees: string[];
  labels: string[];
  due: number | null;
  description?: string;
  criteria?: string[];
}[] = [
  {
    title: "Fechar o roteiro do vídeo de lançamento",
    status: "in_progress",
    priority: "high",
    assignees: ["rollo", "Camila Ribeiro"],
    labels: ["lançamento", "vídeo"],
    due: 0,
    description: "Roteiro com 3 versões de abertura. Referências na pasta do Drive.",
    criteria: ["Roteiro aprovado pela Camila", "Storyboard com 12 quadros", "Trilha escolhida"],
  },
  {
    title: "Corrigir o carrinho que perde itens no Safari",
    status: "in_progress",
    priority: "high",
    assignees: ["felix"],
    labels: ["bug", "site"],
    due: 1,
  },
  {
    title: "Responder as 14 mensagens paradas há mais de 2 horas no WhatsApp",
    status: "todo",
    priority: "high",
    assignees: ["miguel"],
    labels: ["atendimento"],
    due: -1,
  },
  {
    title: "Revisar o PR #482: migração da tabela de pedidos",
    status: "in_review",
    priority: "normal",
    assignees: ["ageu", "Rodrigo Nascimento Figueiredo"],
    labels: ["engenharia", "banco"],
    due: 2,
    description: "A migração adiciona `status_pagamento` e preenche os pedidos antigos em lote.",
    criteria: ["Sem lock longo na tabela", "Rollback testado em staging"],
  },
  {
    title: "Enviar a proposta revisada para a Padaria Estrela do Sul",
    status: "todo",
    priority: "normal",
    assignees: ["torres"],
    labels: ["comercial", "proposta"],
    due: 3,
  },
  {
    title: "Conciliar as cobranças de novembro com o extrato do banco",
    status: "in_progress",
    priority: "normal",
    assignees: ["norton"],
    labels: ["financeiro"],
    due: 5,
  },
  {
    title:
      "Atualizar o manual de marca com a nova paleta e as regras de uso do logotipo em fundo escuro, claro e fotográfico, incluindo exemplos de uso incorreto e a versão para impressão em uma cor",
    status: "todo",
    priority: "low",
    assignees: ["darlan"],
    labels: ["marca"],
    due: 12,
    description: "Título longo de propósito: precisa quebrar bem em cards e listas.",
  },
  {
    title: "Subir as 8 artes do carrossel de dezembro",
    status: "in_review",
    priority: "normal",
    assignees: ["darlan", "Luiza Prado"],
    labels: ["redes", "lançamento"],
    due: 0,
  },
  {
    title: "Configurar o monitoramento de erros no site novo",
    status: "done",
    priority: "normal",
    assignees: ["ageu"],
    labels: ["engenharia"],
    due: -4,
  },
  {
    title: "Publicar a landing do cliente Ótica Visão Clara",
    status: "done",
    priority: "high",
    assignees: ["felix"],
    labels: ["site", "cliente"],
    due: -2,
  },
  {
    title: "Reunião de alinhamento do trimestre",
    status: "done",
    priority: "low",
    assignees: ["Thiago Moura"],
    labels: ["gestão"],
    due: -6,
  },
  {
    title: "Criar a vinheta de 5 segundos para os stories",
    status: "todo",
    priority: "normal",
    assignees: ["rollo"],
    labels: ["vídeo", "redes"],
    due: 6,
  },
  {
    title: "Levantar 10 concorrentes diretos e comparar posicionamento",
    status: "in_progress",
    priority: "normal",
    assignees: ["helena"],
    labels: ["estratégia"],
    due: 4,
    criteria: ["Planilha com 10 marcas", "Resumo de uma página", "Mapa de posicionamento"],
  },
  {
    title: "Migrar o domínio do cliente Café Aurora",
    status: "todo",
    priority: "high",
    assignees: ["felix", "Ana Beatriz Cavalcanti de Albuquerque Mendonça"],
    labels: ["site", "dns"],
    due: 1,
  },
  {
    title: "Testar o fluxo de pagamento por Pix no checkout",
    status: "in_review",
    priority: "high",
    assignees: ["ageu"],
    labels: ["bug", "financeiro"],
    due: -1,
  },
  {
    title: "Preparar a apresentação para a reunião de sexta",
    status: "todo",
    priority: "normal",
    assignees: ["Camila Ribeiro"],
    labels: ["gestão"],
    due: 4,
  },
  {
    title: "Cancelar a assinatura da ferramenta que ninguém usa mais",
    status: "done",
    priority: "low",
    assignees: ["norton"],
    labels: ["financeiro"],
    due: -9,
  },
  {
    title: "Resposta padrão para pedido de segunda via de boleto",
    status: "done",
    priority: "low",
    assignees: ["miguel"],
    labels: ["atendimento"],
    due: -3,
  },
  {
    title: "Reescrever a página de preços com os três planos",
    status: "in_progress",
    priority: "normal",
    assignees: ["Luiza Prado", "torres"],
    labels: ["site", "comercial"],
    due: 7,
  },
  {
    title: "Auditar acessos: quem ainda tem senha do servidor antigo",
    status: "todo",
    priority: "high",
    assignees: ["ageu"],
    labels: ["segurança"],
    due: 2,
  },
];

const ROUTINES: {
  name: string;
  agent: string;
  prompt: string;
  channel: string;
  rule: { freq: "daily" | "weekly" | "monthly"; time: string; byWeekday?: string[]; byMonthDay?: number[] };
  paused?: boolean;
}[] = [
  {
    name: "Resumo da manhã",
    agent: "norton",
    channel: "financeiro",
    prompt: "Resuma o que entrou e saiu ontem e avise de cobranças que vencem hoje.",
    rule: { freq: "daily", time: "08:30", byWeekday: ["MO", "TU", "WE", "TH", "FR"] },
  },
  {
    name: "Fila do WhatsApp parada",
    agent: "miguel",
    channel: "atendimento",
    prompt: "Liste as conversas sem resposta há mais de 2 horas e diga quem deve assumir.",
    rule: { freq: "daily", time: "10:00" },
  },
  {
    name: "Relatório semanal de engenharia",
    agent: "ageu",
    channel: "engenharia",
    prompt: "Resuma PRs mergeados, deploys e incidentes da semana.",
    rule: { freq: "weekly", time: "17:00", byWeekday: ["FR"] },
  },
  {
    name: "Funil comercial da semana",
    agent: "torres",
    channel: "comercial",
    prompt: "Atualize o funil e destaque negociações paradas há mais de 7 dias.",
    rule: { freq: "weekly", time: "09:00", byWeekday: ["MO"] },
  },
  {
    name: "Fechamento mensal para os sócios",
    agent: "norton",
    channel: "financeiro",
    prompt: "Monte o relatório de fechamento do mês com receita, custos e margem por cliente.",
    rule: { freq: "monthly", time: "09:00", byMonthDay: [1] },
  },
  {
    name: "Inspiração de motion da semana",
    agent: "rollo",
    channel: "design",
    prompt: "Traga 5 referências de motion graphics da semana com um comentário curto sobre cada.",
    rule: { freq: "weekly", time: "11:00", byWeekday: ["WE"] },
    paused: true,
  },
];

const WIKI: { folder: string; title: string; body: string }[] = [
  {
    folder: "Processos",
    title: "Como abrir um chamado de atendimento",
    body: "Todo chamado nasce no [[Fila do WhatsApp]] e segue o [[Guia de tom de voz]].\n\n1. Registrar o nome do cliente\n2. Descrever o problema em uma frase\n3. Marcar a prioridade\n\nDúvidas de cobrança vão para o [[Checklist de fechamento mensal]].",
  },
  {
    folder: "Processos",
    title: "Fila do WhatsApp",
    body: "A fila é monitorada pelo Miguel. O que passar de **2 horas** sem resposta sobe para um humano.\n\nVeja também [[Como abrir um chamado de atendimento]] e [[Tabela de preços e planos]].",
  },
  {
    folder: "Processos",
    title: "Checklist de fechamento mensal",
    body: "- [ ] Conciliar o extrato\n- [ ] Emitir as notas pendentes\n- [ ] Enviar o relatório aos sócios\n- [ ] Arquivar os contratos assinados\n\nResponsável: Norton. Relatório descrito em [[Relatório de métricas mensal]].",
  },
  {
    folder: "Marca",
    title: "Guia de tom de voz",
    body: "Falamos como gente: frases curtas, sem jargão, sem exclamação em excesso.\n\nExemplos bons e ruins estão no [[Manual de marca]]. Para posts, use o [[Calendário editorial de dezembro]].",
  },
  {
    folder: "Marca",
    title: "Manual de marca",
    body: "Paleta, tipografia e regras de uso do logotipo.\n\nO tom de escrita está em [[Guia de tom de voz]]; o passo a passo de entrega de peças em [[Entrega de peças para o cliente]].",
  },
  {
    folder: "Marca",
    title: "Calendário editorial de dezembro",
    body: "| Data | Peça | Responsável |\n| --- | --- | --- |\n| 02/12 | Teaser do lançamento | Rollo |\n| 05/12 | Carrossel de bastidores | Darlan |\n| 09/12 | Vídeo de lançamento | Rollo |\n\nSegue o [[Guia de tom de voz]].",
  },
  {
    folder: "Marca",
    title: "Entrega de peças para o cliente",
    body: "Toda peça passa por revisão no #design antes de ir ao cliente. Formatos e nomes de arquivo seguem o [[Manual de marca]].",
  },
  {
    folder: "Engenharia",
    title: "Como subir um deploy em produção",
    body: "Antes de subir: testes verdes, PR aprovado e aviso no #engenharia.\n\nSe algo falhar, siga o [[Plano de resposta a incidentes]].\n\n```bash\nbun run build && bun run deploy\n```",
  },
  {
    folder: "Engenharia",
    title: "Plano de resposta a incidentes",
    body: "1. Declarar o incidente no canal\n2. Nomear quem comanda\n3. Comunicar o cliente em até 30 minutos\n4. Escrever o post-mortem em 48 horas\n\nVeja [[Como subir um deploy em produção]] para o rollback.",
  },
  {
    folder: "Engenharia",
    title: "Tabela de preços e planos",
    body: "Três planos: Essencial, Estúdio e Parceiro. Detalhes de proposta em [[Fila do WhatsApp]] e no funil comercial.",
  },
  {
    folder: "Processos",
    title: "Relatório de métricas mensal",
    body: "Receita, custos, margem por cliente e horas por projeto. Usado no [[Checklist de fechamento mensal]].",
  },
  {
    folder: "Marca",
    title: "Histórico completo do projeto de rebranding da Padaria Estrela do Sul",
    body: [
      "# Histórico do projeto",
      "Documento longo de propósito, para testar rolagem, sumário e quebra de linha em telas estreitas.",
      ...Array.from({ length: 14 }, (_, i) =>
        [
          `## Etapa ${i + 1}: ${["Diagnóstico", "Pesquisa", "Conceito", "Naming", "Logotipo", "Paleta", "Tipografia", "Aplicações", "Embalagens", "Fachada", "Site", "Redes", "Lançamento", "Pós-lançamento"][i]}`,
          `Nesta etapa a equipe reuniu o material do cliente, conversou com os donos e registrou as decisões tomadas. Cada decisão tem um responsável e uma data, e o resultado final conversa com o [[Manual de marca]] e com o [[Guia de tom de voz]]. Houve três rodadas de revisão e uma reunião presencial na padaria, onde o cheiro de pão fresco acabou definindo a paleta quente que o cliente aprovou na hora.`,
          `- Entrega ${i + 1}.1: documento de decisões\n- Entrega ${i + 1}.2: apresentação em PDF\n- Entrega ${i + 1}.3: arquivos finais organizados por formato`,
        ].join("\n\n"),
      ),
    ].join("\n\n"),
  },
];

// ── HTTP part ─────────────────────────────────────────────────────────────────────────────────────────────────────

class Session {
  private cookies = new Map<string, string>();
  constructor(readonly label: string) {}
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair!.indexOf("=");
      if (i > 0) this.cookies.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text */
    }
    return { status: res.status, data };
  }
  async signIn(email: string, password: string) {
    const r = await this.call("POST", "/api/auth/sign-in/email", { email, password });
    return r.status === 200;
  }
}

const tally: Record<string, number> = {};
const bump = (k: string, n = 1) => (tally[k] = (tally[k] ?? 0) + n);

async function runHttp(passwordFile: string, orgId: string) {
  const password = readFileSync(passwordFile, "utf8").split(/\r?\n/)[1]?.trim();
  if (!password) throw new Error("the password file has no second line");
  const me = new Session("owner");
  if (!(await me.signIn(OWNER_EMAIL, password))) throw new Error("sign-in failed");
  const org = `/api/app/organizations/${orgId}`;
  const must = async (what: string, p: Promise<{ status: number; data: any }>) => {
    const r = await p;
    if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    return r.data;
  };

  // Agents: no credential, so they exist and show in lists but cannot answer.
  const existing: any[] = (await must("agents", me.call("GET", `${org}/agents`))).agents ?? [];
  const agentId = new Map<string, string>();
  for (const a of AGENTS) {
    const found = existing.find((x) => x.handle === a.handle || x.name === a.name);
    if (found) {
      agentId.set(a.handle, found.id);
      continue;
    }
    const made = await must(
      `agent ${a.handle}`,
      me.call("POST", `${org}/agents`, {
        handle: a.handle,
        name: a.name,
        role: a.role,
        instructions: `Você é ${a.name}. ${a.role}. Responda sempre em português do Brasil, de forma direta.`,
        appearance: { color: a.color, eyes: a.eyes, accessory: "none" },
      }),
    );
    agentId.set(a.handle, made.id);
    bump("agentes");
  }

  // Departments are agent groups.
  const groupsNow: any[] = (await must("groups", me.call("GET", `${org}/agent-groups`))).groups ?? [];
  for (const name of [...new Set(AGENTS.map((a) => a.group))]) {
    let g = groupsNow.find((x) => x.name === name);
    if (!g) {
      const r = await must(`group ${name}`, me.call("POST", `${org}/agent-groups`, { name }));
      const list: any[] = r.groups;
      g = list.find((x) => x.name === name);
      groupsNow.push(g);
      bump("setores");
    }
    for (const a of AGENTS.filter((x) => x.group === name)) {
      const already = (g.agentIds ?? g.agents?.map((x: any) => x.id ?? x) ?? []).includes(agentId.get(a.handle));
      if (!already) await me.call("PUT", `${org}/agents/${agentId.get(a.handle)}/group`, { groupId: g.id });
    }
  }

  // People: sign up here; the engine part makes them members (the workspace link only queues a request that an
  // emailed code would prove, and no mail goes out locally).
  const userId = new Map<string, string>();
  const sessions = new Map<string, Session>();
  for (const p of PEOPLE) {
    const s = new Session(p.name);
    const signedUp = await s.call("POST", "/api/auth/sign-up/email", {
      name: p.name,
      email: p.email,
      password: PEOPLE_PASSWORD,
    });
    if (signedUp.status >= 300 && !(await s.signIn(p.email, PEOPLE_PASSWORD)))
      throw new Error(`person ${p.name} cannot sign in`);
    if (signedUp.status < 300) bump("pessoas");
    sessions.set(p.name, s);
  }
  const members: any[] = (await must("members", me.call("GET", `${org}/members`))).members ?? [];
  for (const p of PEOPLE) {
    const m = members.find((x) => (x.email ?? x.user?.email) === p.email);
    if (m) userId.set(p.name, m.userId ?? m.user?.id ?? m.id);
  }

  // Channels with their members.
  const channelsNow: any[] = (await must("channels", me.call("GET", `${org}/channels`))).channels ?? [];
  const channelId = new Map<string, string>();
  for (const c of channelsNow) channelId.set(c.name, c.id);
  const plan: Record<string, string[]> = {
    design: ["rollo", "darlan", "helena"],
    atendimento: ["miguel", "norton"],
    engenharia: ["felix", "ageu"],
    comercial: ["torres", "norton", "helena"],
  };
  for (const c of CHANNELS) {
    if (!channelId.has(c.name)) {
      const made = await must(
        `channel ${c.name}`,
        me.call("POST", `${org}/channels`, { name: c.name, topic: c.topic, visibility: "public" }),
      );
      channelId.set(c.name, made.id);
      bump("canais");
    }
    const id = channelId.get(c.name)!;
    for (const h of plan[c.name] ?? [])
      await me.call("POST", `${org}/channels/${id}/members`, { agentId: agentId.get(h), autoReply: false });
    for (const p of PEOPLE) {
      const uid = userId.get(p.name);
      if (uid) await me.call("POST", `${org}/channels/${id}/members`, { userId: uid });
    }
  }
  for (const name of ["general", "lancamento-dezembro", "financeiro"]) {
    const id = channelId.get(name);
    if (!id) continue;
    for (const h of ["norton", "rollo", "torres"])
      await me.call("POST", `${org}/channels/${id}/members`, { agentId: agentId.get(h), autoReply: false });
    for (const p of PEOPLE) {
      const uid = userId.get(p.name);
      if (uid) await me.call("POST", `${org}/channels/${id}/members`, { userId: uid });
    }
  }

  // Direct conversations of the owner with each person, and the people with one another.
  for (const p of PEOPLE) {
    const uid = userId.get(p.name);
    if (!uid) continue;
    const r = await me.call("POST", `${org}/dms`, { userId: uid });
    if (r.status < 300) bump("conversas diretas");
  }
  const pair = async (a: string, b: string) => {
    const s = sessions.get(a);
    const uid = userId.get(b);
    if (s && uid) await s.call("POST", `${org}/dms`, { userId: uid });
  };
  await pair(PEOPLE[0].name, PEOPLE[1].name);
  await pair(PEOPLE[2].name, PEOPLE[3].name);

  // Tasks.
  const issuesNow: any[] = (await must("issues", me.call("GET", `${org}/issues`))).issues ?? [];
  const assignee = (key: string) =>
    agentId.has(key)
      ? { type: "agent" as const, id: agentId.get(key)! }
      : { type: "person" as const, id: userId.get(key)! };
  for (const t of ISSUES) {
    const have = issuesNow.find((i) => i.title === t.title);
    if (have) {
      // People may have joined since the task was made: keep its assignees in step.
      await me.call("PATCH", `${org}/issues/${have.id}`, {
        assignees: t.assignees.filter((k) => agentId.has(k) || userId.has(k)).map(assignee),
      });
      continue;
    }
    const made = await must(
      `issue ${t.title.slice(0, 20)}`,
      me.call("POST", `${org}/issues`, {
        title: t.title,
        ...(t.description ? { description: t.description } : {}),
        ...(t.criteria ? { criteria: t.criteria } : {}),
        priority: t.priority,
        labels: t.labels,
        assignees: t.assignees.filter((k) => agentId.has(k) || userId.has(k)).map(assignee),
        ...(t.due === null ? {} : { dueDate: day(t.due) }),
      }),
    );
    if (t.status !== "todo") await me.call("PATCH", `${org}/issues/${made.id}`, { status: t.status });
    bump("tarefas");
  }

  // Routines (one paused).
  const routinesNow: any[] = (await must("routines", me.call("GET", `${org}/routines`))).routines ?? [];
  for (const r of ROUTINES) {
    if (routinesNow.some((x) => x.name === r.name)) continue;
    const cid = channelId.get(r.channel);
    const aid = agentId.get(r.agent);
    if (!cid || !aid) continue;
    const res = await me.call("POST", `${org}/routines`, {
      name: r.name,
      agentId: aid,
      prompt: r.prompt,
      target: { type: "channel", channelId: cid },
      trigger: { type: "schedule", rule: { ...r.rule, timezone: TZ } },
    });
    if (res.status >= 300) {
      console.warn(`routine ${r.name}: ${res.status} ${JSON.stringify(res.data).slice(0, 250)}`);
      continue;
    }
    if (r.paused) await me.call("PATCH", `${org}/routines/${res.data.id}`, { active: false });
    bump("rotinas");
  }

  // Wiki.
  const pagesNow: any[] = (await must("wiki", me.call("GET", `${org}/wiki/pages`))).pages ?? [];
  for (const w of WIKI) {
    if (pagesNow.some((p) => p.title === w.title)) continue;
    const res = await me.call("POST", `${org}/wiki/pages`, { title: w.title, body: w.body, folder: w.folder });
    if (res.status >= 300) console.warn(`wiki ${w.title}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
    else bump("páginas da wiki");
  }

  // Calendar: this week and next, with a few all-day events, plus reminders.
  const from = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 16 * 86_400_000).toISOString();
  const evNow = await me.call("GET", `${org}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const known = new Set<string>(((evNow.data?.events ?? []) as any[]).map((e) => e.title));
  const at = (offset: number, hh: number, mm = 0) => {
    const base = new Date(Date.now() + offset * 86_400_000);
    // Brasília is UTC-3 all year since 2019.
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh + 3, mm)).toISOString();
  };
  const who = (...keys: string[]) => keys.filter((k) => agentId.has(k) || userId.has(k)).map(assignee);
  const events: {
    title: string;
    description?: string;
    offset: number;
    h?: number;
    len?: number;
    allDay?: boolean;
    location?: string;
    with: string[];
  }[] = [
    {
      title: "Daily do estúdio",
      offset: 0,
      h: 9,
      len: 0.5,
      with: ["Camila Ribeiro", "rollo", "felix", "darlan"],
      location: "Google Meet",
    },
    {
      title: "Revisão das artes do carrossel de dezembro",
      offset: 0,
      h: 14,
      len: 1,
      with: ["Camila Ribeiro", "Luiza Prado", "darlan"],
      description: "Passar as 8 artes uma a uma. Levar as dúvidas de legenda.",
    },
    {
      title: "Alinhamento com o cliente Padaria Estrela do Sul",
      offset: 1,
      h: 10,
      len: 1.5,
      with: ["Thiago Moura", "torres", "helena"],
      location: "Escritório do cliente, Rua das Palmeiras, 1200",
    },
    {
      title: "Planejamento do lançamento de dezembro com todas as áreas e o time de atendimento",
      offset: 2,
      h: 15,
      len: 2,
      with: ["Camila Ribeiro", "Rodrigo Nascimento Figueiredo", "norton", "miguel", "rollo"],
    },
    { title: "Fechamento da semana", offset: 4, h: 17, len: 1, with: ["Thiago Moura", "norton"] },
    { title: "Feriado: ponte", offset: 5, allDay: true, with: [] },
    { title: "Entrega do vídeo de lançamento", offset: 3, allDay: true, with: ["rollo", "Camila Ribeiro"] },
    {
      title: "Almoço com a equipe",
      offset: 6,
      h: 12,
      len: 1.5,
      with: ["Camila Ribeiro", "Thiago Moura", "Luiza Prado", "Rodrigo Nascimento Figueiredo"],
      location: "Restaurante Sabor da Terra",
    },
    {
      title: "Revisão de segurança dos acessos",
      offset: 7,
      h: 11,
      len: 1,
      with: ["ageu", "Rodrigo Nascimento Figueiredo"],
    },
    {
      title: "Apresentação de resultados do trimestre",
      offset: 8,
      h: 16,
      len: 1.5,
      with: ["Camila Ribeiro", "Thiago Moura", "norton", "helena", "torres"],
    },
    {
      title: "Onboarding da Luiza",
      offset: 9,
      h: 10,
      len: 2,
      with: ["Luiza Prado", "Ana Beatriz Cavalcanti de Albuquerque Mendonça"],
    },
    {
      title: "Retrospectiva do lançamento",
      offset: 11,
      h: 15,
      len: 1,
      with: ["Camila Ribeiro", "rollo", "felix", "miguel", "torres"],
    },
  ];
  for (const e of events) {
    if (known.has(e.title)) continue;
    const startIso = e.allDay ? undefined : at(e.offset, Math.floor(e.h!), (e.h! % 1) * 60);
    const endIso = e.allDay
      ? undefined
      : new Date(new Date(startIso!).getTime() + (e.len ?? 1) * 3_600_000).toISOString();
    const res = await me.call("POST", `${org}/calendar/events`, {
      title: e.title,
      ...(e.description ? { description: e.description } : {}),
      ...(e.allDay
        ? { allDay: true, startDate: day(e.offset), endDate: day(e.offset) }
        : { start: startIso, end: endIso }),
      timezone: TZ,
      ...(e.location ? { location: e.location } : {}),
      participants: who(...e.with),
    });
    if (res.status >= 300)
      console.warn(`event ${e.title.slice(0, 20)}: ${res.status} ${JSON.stringify(res.data).slice(0, 250)}`);
    else bump("eventos");
  }
  const remindersNow = await me.call("GET", `${org}/reminders`);
  const remindTexts = new Set<string>(((remindersNow.data?.reminders ?? []) as any[]).map((r) => r.message));
  const general = channelId.get("general") ?? [...channelId.values()][0]!;
  for (const [text, offset, h] of [
    ["Mandar o relatório para os sócios", 1, 9],
    ["Cobrar o briefing do cliente da Ótica", 2, 14],
    ["Renovar o domínio do estúdio antes do vencimento", 6, 10],
  ] as const) {
    if (remindTexts.has(text)) continue;
    const r = await me.call("POST", `${org}/reminders`, { channelId: general, at: at(offset, h), text, timezone: TZ });
    if (r.status < 300) bump("lembretes");
  }

  // Boards (their widgets come with the engine part).
  const boardsNow: any[] = (await must("boards", me.call("GET", `${org}/dashboards`))).dashboards ?? [];
  for (const [title, about] of [
    ["Operação do estúdio", "Fila, entregas e saúde dos clientes em uma tela só."],
    [
      "Financeiro e comercial: visão dos sócios com todas as metas do trimestre",
      "Receita, funil e metas. Atualizado toda manhã.",
    ],
  ] as const) {
    if (boardsNow.some((b) => b.title === title)) continue;
    const r = await me.call("POST", `${org}/dashboards`, { title, about, audience: "workspace", editPolicy: "owner" });
    if (r.status < 300) bump("painéis");
    else console.warn(`board ${title.slice(0, 20)}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  console.log("HTTP part done. Created:", tally);
}

// ── Engine part ───────────────────────────────────────────────────────────────────────────────────────────────────

async function runEngine(folder: string, orgId: string) {
  const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const { createDatabase, eq, and, sql } = await import(`${root}packages/db/src/index.ts`);
  const schema = await import(`${root}packages/db/src/schema/index.ts`);
  // The package entry first: the engine files import one another in a cycle that only resolves from there.
  await import(`${root}packages/engine/src/index.ts`);
  const { insertMessage } = await import(`${root}packages/engine/src/messages.ts`);
  const { notify } = await import(`${root}packages/engine/src/notifications.ts`);
  const { createThreadFromRange } = await import(`${root}packages/engine/src/threads.ts`);
  const dashboards = await import(`${root}packages/engine/src/dashboards/service.ts`);
  const { createMemoryPubSub } = await import(`${root}packages/adapters/src/pubsub.ts`);

  const handle = createDatabase({ url: `pglite:///${folder}`, poolMax: 1 });
  const db = handle.db;
  const pubsub = createMemoryPubSub();
  const startedAt = new Date();
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  const counts: Record<string, number> = {};
  const add = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  const { joinOrganization } = await import(`${root}packages/engine/src/organizations.ts`);
  for (const p of PEOPLE) {
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, p.email));
    if (!u) continue;
    const [m] = await db
      .select({ id: schema.organizationMembers.userId })
      .from(schema.organizationMembers)
      .where(and(eq(schema.organizationMembers.orgId, orgId), eq(schema.organizationMembers.userId, u.id)));
    if (m) continue;
    await joinOrganization(db, orgId, u.id, "member");
    add("pessoas (entradas)");
  }

  const agentRows: any[] = await db.select().from(schema.agents).where(eq(schema.agents.orgId, orgId));
  const aid = (h: string) => agentRows.find((a) => a.handle === h)?.id as string;
  const memberRows: any[] = await db
    .select({
      userId: schema.organizationMembers.userId,
      handle: schema.organizationMembers.handle,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.organizationMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.organizationMembers.userId))
    .where(eq(schema.organizationMembers.orgId, orgId));
  const owner = memberRows.find((m) => m.email === OWNER_EMAIL);
  if (!owner) throw new Error("the test account is not a member of this workspace");
  const people = (n: string) => memberRows.find((m) => m.name === n)?.userId as string | undefined;
  const chans: any[] = await db.select().from(schema.channels).where(eq(schema.channels.orgId, orgId));
  const chan = (name: string) => chans.find((c) => c.name === name);

  type Who = { agent: string } | { person: string };
  const person = (n: string): Who => ({ person: n });
  const A = (h: string): Who => ({ agent: h });
  const ME: Who = { person: "__owner__" };
  const authorOf = (w: Who) =>
    "agent" in w
      ? { type: "agent" as const, agentId: aid(w.agent), runId: null, hop: 0, stretchId: null }
      : {
          type: "person" as const,
          userId: w.person === "__owner__" ? owner.userId : (people(w.person) ?? owner.userId),
        };
  const nameOf = (w: Who) =>
    "agent" in w
      ? (agentRows.find((a) => a.handle === w.agent)?.name ?? w.agent)
      : w.person === "__owner__"
        ? owner.name
        : w.person;
  const reactorOf = (w: Who) =>
    "agent" in w
      ? { agentId: aid(w.agent), userId: null }
      : { userId: w.person === "__owner__" ? owner.userId : people(w.person)!, agentId: null };

  // Scripts of messages per channel: [author, text, minutes ago, optional flags].
  type Line = {
    by: Who;
    text: string;
    ago: number;
    react?: [string, Who[]][];
    quote?: number; // index of an earlier line this one quotes
    thread?: { from: number; title?: string }; // starts a thread from lines [from..this]
    inThread?: number; // index of the line that opened the thread (by `thread.from`)
  };
  const longText =
    "Pessoal, segue o resumo completo da reunião de ontem com o cliente: ele gostou da direção geral, mas pediu três ajustes importantes. Primeiro, o logotipo precisa funcionar em fundo escuro sem perder legibilidade. Segundo, a paleta deve ter uma cor de apoio mais quente, algo próximo do terracota. Terceiro, a tipografia dos títulos precisa ser mais condensada para caber nas embalagens pequenas. Combinei que entregamos uma nova rodada até quinta-feira às 18h, e que o Rollo prepara uma versão em movimento do logotipo para a apresentação. Se alguém tiver restrições de agenda, avisem hoje para eu reorganizar as entregas e não estourar o prazo combinado com a diretoria do cliente.";
  const scripts: Record<string, Line[]> = {
    general: [
      {
        by: person("Camila Ribeiro"),
        text: "Bom dia, time! Hoje o foco é o lançamento de dezembro. Quem precisar de ajuda me chama.",
        ago: 60 * 52,
        react: [
          ["👍", [ME, person("Thiago Moura")]],
          ["☀️", [A("rollo")]],
        ],
      },
      {
        by: A("norton"),
        text: "Bom dia. Os pagamentos de novembro estão 92% conciliados; faltam 3 lançamentos para eu fechar.",
        ago: 60 * 51,
      },
      { by: ME, text: "Ótimo. @norton me manda a lista das 3 pendentes quando puder.", ago: 60 * 50 },
      {
        by: person("Thiago Moura"),
        text: "Lembrete: sexta tem a apresentação de resultados do trimestre. Quem tiver número para colocar, mande até quarta.",
        ago: 60 * 30,
        react: [["✅", [ME, person("Luiza Prado")]]],
      },
      {
        by: person("Luiza Prado"),
        text: "Mandei os números de redes sociais na pasta compartilhada. Alcance subiu 38% no mês.",
        ago: 60 * 29,
      },
      {
        by: A("torres"),
        text: "No comercial fechamos 4 propostas essa semana e temos mais 6 em negociação. O detalhe está no funil.",
        ago: 60 * 28,
        react: [["🎉", [person("Camila Ribeiro"), ME, A("norton")]]],
      },
      {
        by: person("Rodrigo Nascimento Figueiredo"),
        text: "Aviso: vou subir a atualização do servidor às 22h. Se alguém notar lentidão, falem comigo.",
        ago: 60 * 20,
      },
      {
        by: person("Ana Beatriz Cavalcanti de Albuquerque Mendonça"),
        text: "Pessoal, o recibo do coworking vence na sexta. Quem ainda não mandou o comprovante, por favor envie hoje.",
        ago: 60 * 12,
      },
      {
        by: ME,
        text: "Vamos manter a daily às 9h, mas curta: 15 minutos no máximo.",
        ago: 60 * 8,
        react: [["👍", [person("Camila Ribeiro")]]],
      },
      {
        by: A("helena"),
        text: "Subi o resumo de posicionamento dos concorrentes na wiki: [[Guia de tom de voz]]. Comentários são bem-vindos.",
        ago: 60 * 3,
      },
      { by: person("Camila Ribeiro"), text: "Obrigada, Helena! Vou ler hoje à tarde.", ago: 60 * 2 },
    ],
    "lancamento-dezembro": [
      {
        by: person("Camila Ribeiro"),
        text: "Canal aberto para o lançamento de dezembro. Prazo final: dia 12. Cada um coloca aqui o que está no seu radar.",
        ago: 60 * 70,
      },
      {
        by: A("rollo"),
        text: "Estou com o vídeo de lançamento: roteiro até hoje, animação até quarta. Preciso da trilha aprovada.",
        ago: 60 * 69,
        react: [["🙏", [ME]]],
      },
      { by: ME, text: "Trilha: vamos de instrumental, sem letra. @rollo manda 3 opções.", ago: 60 * 68 },
      {
        by: A("rollo"),
        text: "Mandei 3 opções na pasta, em ordem de preferência. A segunda tem o clima mais próximo do que a Camila descreveu.",
        ago: 60 * 55,
      },
      { by: A("darlan"), text: "Carrossel: 8 artes prontas, faltam as legendas.", ago: 60 * 40 },
      {
        by: person("Luiza Prado"),
        text: "Posso escrever as legendas. Qual o tom? Mais leve ou mais institucional?",
        ago: 60 * 39,
        quote: 4,
      },
      {
        by: person("Camila Ribeiro"),
        text: "Leve, mas sem gíria. Segue o [[Guia de tom de voz]].",
        ago: 60 * 38,
        quote: 5,
      },
      {
        by: A("torres"),
        text: "Lista de convidados da pré-venda:\n- 12 clientes antigos\n- 8 parceiros\n- 5 imprensa\n- 3 influenciadoras locais\n\nTotal de 28 convites. Preciso do texto do convite até quinta.",
        ago: 60 * 24,
      },
      { by: person("Thiago Moura"), text: longText, ago: 60 * 22 },
      {
        by: A("felix"),
        text: "A página do lançamento já está no ar em staging. @ageu pode revisar o formulário de cadastro?",
        ago: 60 * 10,
        react: [["👀", [A("ageu")]]],
      },
      {
        by: A("ageu"),
        text: "Revisei. Dois pontos: validação de e-mail e proteção contra spam. Abri tarefas para os dois.",
        ago: 60 * 6,
      },
      { by: ME, text: "Perfeito. Quem cuida do plano B se o formulário cair no dia?", ago: 60 * 5 },
      {
        by: A("miguel"),
        text: "Posso receber cadastros pelo WhatsApp como plano B, é só preparar a mensagem automática.",
        ago: 60 * 4,
        react: [["💡", [ME, person("Camila Ribeiro")]]],
      },
    ],
    financeiro: [
      {
        by: A("norton"),
        text: "Resumo de novembro: receita R$ 184.320,00; custos R$ 121.470,00; margem de 34,1%. Detalhes na planilha.",
        ago: 60 * 90,
        react: [["📈", [ME, person("Thiago Moura")]]],
      },
      { by: ME, text: "Boa. E o contas a receber?", ago: 60 * 89 },
      {
        by: A("norton"),
        text: "R$ 42.800,00 em aberto, sendo R$ 9.500,00 vencido há mais de 15 dias (Café Aurora).",
        ago: 60 * 88,
      },
      { by: person("Thiago Moura"), text: "Falo com o Café Aurora hoje.", ago: 60 * 70 },
      {
        by: A("norton"),
        text: "Notas fiscais pendentes de emissão:\n1. Ótica Visão Clara (R$ 6.200,00)\n2. Padaria Estrela do Sul (R$ 11.900,00)\n3. Studio Lume (R$ 3.450,00)",
        ago: 60 * 40,
      },
      {
        by: person("Ana Beatriz Cavalcanti de Albuquerque Mendonça"),
        text: "Emiti as duas primeiras. A da Studio Lume depende do CNPJ novo.",
        ago: 60 * 30,
      },
      { by: ME, text: "Pedi o CNPJ novo ao cliente. @norton avisa quando chegar.", ago: 60 * 6 },
      { by: A("norton"), text: "Combinado.", ago: 60 * 5 },
    ],
    design: [
      {
        by: A("rollo"),
        text: "Teaser do lançamento v1 pronto para revisão: 12s, vertical.",
        ago: 60 * 100,
        react: [["🔥", [ME, A("darlan"), person("Camila Ribeiro")]]],
      },
      {
        by: A("darlan"),
        text: "Ficou incrível. Só o contraste do texto no segundo 8 está baixo no celular.",
        ago: 60 * 99,
      },
      { by: A("rollo"), text: "Ajustado. Subi a v2.", ago: 60 * 90 },
      { by: person("Camila Ribeiro"), text: "Aprovado! Pode seguir para o resto da série.", ago: 60 * 80, quote: 2 },
      {
        by: A("helena"),
        text: "Referências de paleta quente para a Padaria Estrela do Sul:\n- Terracota e creme\n- Mostarda queimada\n- Verde-oliva como apoio\n\nTudo alinhado com o conceito de pão artesanal.",
        ago: 60 * 60,
      },
      {
        by: A("darlan"),
        text: "Organizei a pasta de assets por cliente e por formato. Nomes seguem o padrão cliente_peça_formato_v1.",
        ago: 60 * 50,
      },
      {
        by: ME,
        text: "Perfeito. Quero ver as variações do logotipo em fundo escuro amanhã cedo.",
        ago: 60 * 40,
        react: [["👍", [A("darlan")]]],
      },
      {
        by: A("rollo"),
        text: "Posso animar o logotipo em 3 versões: entrada, loop e saída. Qual prioridade?",
        ago: 60 * 30,
      },
      { by: person("Luiza Prado"), text: "Entrada e loop primeiro, saída só se sobrar tempo.", ago: 60 * 29 },
      {
        by: A("darlan"),
        text: "Subi 5 variações de capa para o carrossel, escolham as 2 favoritas.",
        ago: 60 * 15,
        react: [
          ["1️⃣", [ME]],
          ["3️⃣", [person("Camila Ribeiro"), person("Luiza Prado")]],
        ],
      },
      { by: person("Thiago Moura"), text: "Vou de 3 e 5.", ago: 60 * 14 },
    ],
    atendimento: [
      { by: A("miguel"), text: "Fila da manhã: 23 conversas, 18 resolvidas, 5 aguardando cliente.", ago: 60 * 48 },
      {
        by: person("Luiza Prado"),
        text: "Tem um cliente reclamando de cobrança duplicada. Passo para o financeiro?",
        ago: 60 * 47,
      },
      {
        by: A("miguel"),
        text: "Passei o histórico para a Ana Beatriz. Cliente avisado que a resposta sai em até 4 horas.",
        ago: 60 * 46,
        react: [["👍", [person("Luiza Prado")]]],
      },
      { by: A("norton"), text: "Confirmo a duplicidade. Estorno solicitado, prazo de 2 dias úteis.", ago: 60 * 40 },
      {
        by: A("miguel"),
        text: "Resposta padrão para segunda via de boleto atualizada:\n\n1. Confirmar CPF/CNPJ\n2. Enviar o link do boleto\n3. Avisar o novo vencimento\n4. Perguntar se precisa de mais algo",
        ago: 60 * 30,
      },
      { by: ME, text: "Boa, Miguel. Podemos medir a satisfação ao final da conversa?", ago: 60 * 25 },
      {
        by: A("miguel"),
        text: "Posso sim. Mensagem curta com nota de 1 a 5. Começo hoje.",
        ago: 60 * 24,
        react: [["⭐", [ME]]],
      },
      {
        by: person("Rodrigo Nascimento Figueiredo"),
        text: "Atenção: o webhook do WhatsApp caiu por 10 minutos às 14h. Já normalizou, mas confiram se alguma mensagem ficou sem resposta.",
        ago: 60 * 8,
      },
      { by: A("miguel"), text: "Verifiquei: 2 mensagens ficaram sem resposta, já respondidas.", ago: 60 * 7 },
    ],
    engenharia: [
      {
        by: A("ageu"),
        text: "PR #482 aberto: migração da tabela de pedidos. Precisa de revisão antes de sexta.",
        ago: 60 * 60,
      },
      { by: person("Rodrigo Nascimento Figueiredo"), text: "Vou revisar à tarde. A migração usa lock?", ago: 60 * 59 },
      {
        by: A("ageu"),
        text: "Não. A coluna entra como nula e o preenchimento é em lotes de 1.000 linhas.",
        ago: 60 * 58,
      },
      {
        by: A("felix"),
        text: "Corrigi o bug do carrinho no Safari. A causa era o armazenamento local bloqueado no modo privado.",
        ago: 60 * 40,
        react: [["🎯", [A("ageu"), ME]]],
      },
      {
        by: person("Rodrigo Nascimento Figueiredo"),
        text: "Deploy de ontem: tempo de resposta caiu de 480 ms para 310 ms no p95.",
        ago: 60 * 30,
        react: [["🚀", [ME, A("felix"), A("ageu")]]],
      },
      {
        by: A("ageu"),
        text: "Dívida técnica da semana:\n- Atualizar dependências com alerta de segurança\n- Remover o endpoint antigo de pedidos\n- Cobrir o checkout com testes\n- Revisar índices do banco",
        ago: 60 * 20,
      },
      { by: ME, text: "Prioridade: segurança primeiro. O resto pode esperar o lançamento.", ago: 60 * 19 },
      { by: A("ageu"), text: "Anotado. Abro as tarefas.", ago: 60 * 18 },
      { by: person("Thiago Moura"), text: "Alguém sabe por que o ambiente de staging está lento?", ago: 60 * 6 },
      { by: A("felix"), text: "Está rodando a migração do PR #482. Termina em uns 20 minutos.", ago: 60 * 5 },
    ],
    comercial: [
      {
        by: A("torres"),
        text: "Funil da semana: 6 propostas enviadas, 4 aprovadas, 2 em revisão. Ticket médio R$ 14.200,00.",
        ago: 60 * 70,
        react: [["🎉", [ME, person("Thiago Moura")]]],
      },
      { by: ME, text: "Excelente. E a Padaria Estrela do Sul?", ago: 60 * 69 },
      {
        by: A("torres"),
        text: "Pediram desconto de 10%. Sugiro 5% e incluir o kit de redes sociais no pacote.",
        ago: 60 * 68,
      },
      {
        by: person("Camila Ribeiro"),
        text: "Concordo com o 5% e o kit. Mas só se fecharem o contrato anual.",
        ago: 60 * 60,
      },
      { by: A("torres"), text: "Combinado, envio hoje.", ago: 60 * 59 },
      {
        by: A("helena"),
        text: "Análise rápida: clientes do segmento de alimentação respondem melhor a propostas com prova visual. Sugiro incluir 2 aplicações mockadas.",
        ago: 60 * 40,
      },
      { by: person("Luiza Prado"), text: "Posso montar os mockups. Me passem o logotipo atualizado.", ago: 60 * 38 },
      {
        by: A("torres"),
        text: "Metas do trimestre:\n1. R$ 520 mil em contratos novos\n2. 8 clientes recorrentes\n3. Reduzir o ciclo de venda para 21 dias",
        ago: 60 * 20,
      },
      { by: ME, text: "Estamos em 61% da meta de receita. Vamos acelerar as renovações.", ago: 60 * 6 },
    ],
  };

  // Messages: written once per channel (marked in meta), back-dated, never starting a run.
  const seeded = async (channelId: string) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.messages)
      .where(and(eq(schema.messages.channelId, channelId), sql`${schema.messages.meta} ->> 'seed' = 'demo'`));
    return Number(r?.n ?? 0) > 0;
  };
  const sent = new Map<string, { id: string; line: Line; chanId: string }[]>();
  for (const [name, lines] of Object.entries(scripts)) {
    const c = chan(name);
    if (!c || (await seeded(c.id))) continue;
    const written: { id: string; line: Line; chanId: string }[] = [];
    const ordered = [...lines].map((l, i) => ({ l, i })).sort((a, b) => b.l.ago - a.l.ago);
    const byIndex = new Map<number, string>();
    for (const { l, i } of ordered) {
      const quoted = l.quote !== undefined ? byIndex.get(l.quote) : undefined;
      const quotedLine = l.quote !== undefined ? lines[l.quote] : undefined;
      const meta: Record<string, unknown> = { seed: "demo" };
      if (quoted && quotedLine)
        meta.replyTo = {
          messageId: quoted,
          threadId: null,
          author: {
            type: "agent" in quotedLine.by ? "agent" : "person",
            id:
              "agent" in quotedLine.by
                ? aid(quotedLine.by.agent)
                : (people((quotedLine.by as any).person) ?? owner.userId),
          },
          authorName: nameOf(quotedLine.by),
          excerpt: quotedLine.text.replace(/\s+/g, " ").slice(0, 200),
        };
      const m = await insertMessage(db, {
        orgId,
        channelId: c.id,
        author: authorOf(l.by),
        body: l.text,
        meta,
        createdAt: ago(l.ago),
      });
      byIndex.set(i, m.id);
      written.push({ id: m.id, line: l, chanId: c.id });
      add("mensagens");
      for (const [emoji, who] of l.react ?? []) {
        for (const w of who) {
          await db
            .insert(schema.messageReactions)
            .values({
              orgId,
              messageId: m.id,
              reaction: emoji,
              createdAt: ago(Math.max(1, l.ago - 3)),
              ...reactorOf(w),
            })
            .onConflictDoNothing();
          add("reações");
        }
      }
    }
    sent.set(name, written);
  }

  // A thread with replies in #lancamento-dezembro (built from its first messages) and one in #engenharia.
  const threadsFor: [string, number, number, { by: Who; text: string; ago: number }[]][] = [
    [
      "lancamento-dezembro",
      4,
      6,
      [
        { by: person("Camila Ribeiro"), text: "Sobre o convite: prefiro texto curto e imagem forte.", ago: 60 * 20 },
        { by: A("torres"), text: "Escrevo 3 versões e vocês escolhem.", ago: 60 * 19 },
        { by: person("Luiza Prado"), text: "Posso ilustrar. Preciso do prazo.", ago: 60 * 18 },
        { by: A("darlan"), text: "Tenho uma base de convite no Figma que dá para adaptar.", ago: 60 * 17 },
        { by: person("Camila Ribeiro"), text: "Perfeito, vamos com a do Darlan.", ago: 60 * 16 },
      ],
    ],
    [
      "engenharia",
      0,
      2,
      [
        {
          by: person("Rodrigo Nascimento Figueiredo"),
          text: "Encontrei um ponto: o índice composto de pedidos não cobre a consulta do relatório.",
          ago: 60 * 50,
        },
        { by: A("ageu"), text: "Boa. Adiciono o índice em uma migração separada.", ago: 60 * 49 },
        { by: A("ageu"), text: "Feito, PR #483.", ago: 60 * 45 },
      ],
    ],
  ];
  for (const [name, a, b, replies] of threadsFor) {
    const w = sent.get(name);
    const c = chan(name);
    if (!w || !c) continue;
    const ordered = [...w].sort((x, y) => y.line.ago - x.line.ago);
    const first = ordered[a];
    const last = ordered[b];
    if (!first || !last) continue;
    try {
      const info: any = await createThreadFromRange({ db, pubsub }, owner.userId, {
        orgId,
        channelId: c.id,
        firstMessageId: first.id,
        lastMessageId: last.id,
        title: name === "engenharia" ? "Revisão da migração de pedidos" : "Convite da pré-venda",
      });
      const threadId = info.id ?? info.threadId;
      for (const r of replies) {
        await insertMessage(db, {
          orgId,
          channelId: c.id,
          threadId,
          author: authorOf(r.by),
          body: r.text,
          meta: { seed: "demo" },
          createdAt: ago(r.ago),
        });
        add("respostas em threads");
      }
      add("threads");
    } catch (e) {
      console.warn(`thread ${name}: ${(e as Error).message}`);
    }
  }

  // Direct conversations: a few lines each with the owner and between people.
  const dmLines: [string, Who, string, number][] = [
    ["Camila Ribeiro", person("Camila Ribeiro"), "Você viu o briefing da Padaria? Mandei ontem à noite.", 60 * 30],
    ["Camila Ribeiro", ME, "Vi sim. Gostei da direção, só quero ver mais opções de logotipo.", 60 * 29],
    [
      "Camila Ribeiro",
      person("Camila Ribeiro"),
      "Peço ao Rollo para animar duas delas, assim o cliente sente a marca.",
      60 * 28,
    ],
    [
      "Rodrigo Nascimento Figueiredo",
      person("Rodrigo Nascimento Figueiredo"),
      "Posso subir o deploy hoje à noite? Prefiro avisar antes.",
      60 * 10,
    ],
    ["Thiago Moura", person("Thiago Moura"), "Fechei a reunião com o Café Aurora. Eles vão pagar na sexta.", 60 * 5],
    [
      "Ana Beatriz Cavalcanti de Albuquerque Mendonça",
      person("Ana Beatriz Cavalcanti de Albuquerque Mendonça"),
      "Preciso da sua assinatura em dois contratos. Mando por e-mail?",
      60 * 3,
    ],
    ["Luiza Prado", person("Luiza Prado"), "Terminei as legendas. Quer revisar antes de eu agendar?", 60 * 2],
  ];
  for (const [other, by, text, minutes] of dmLines) {
    const otherId = people(other);
    if (!otherId) continue;
    const dm = await findDm(db, schema, orgId, owner.userId, otherId);
    if (!dm) continue;
    const exists = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(and(eq(schema.messages.channelId, dm.id), eq(schema.messages.body, text)));
    if (exists.length) continue;
    await insertMessage(db, {
      orgId,
      channelId: dm.id,
      author: authorOf(by),
      body: text,
      meta: { seed: "demo" },
      createdAt: ago(minutes),
    });
    add("mensagens diretas");
  }

  // Widgets: boards made over HTTP, plus the owner's home board.
  const deps = { db, pubsub };
  const boards: any[] = await db.select().from(schema.dashboards).where(eq(schema.dashboards.orgId, orgId));
  const home = await dashboards.getOrCreateHome(deps, owner.userId, orgId);
  const widgetsFor = async (
    boardId: string,
    specs: { title: string; agent: string; size: "s" | "m" | "l"; spec: any }[],
  ) => {
    const have: any[] = await db
      .select()
      .from(schema.dashboardWidgets)
      .where(eq(schema.dashboardWidgets.dashboardId, boardId));
    for (const w of specs) {
      if (have.some((x) => x.title === w.title)) continue;
      await dashboards.insertWidget(deps, {
        orgId,
        dashboardId: boardId,
        agentId: aid(w.agent),
        title: w.title,
        prompt: `Atualize o painel "${w.title}".`,
        format: w.spec.kind,
        schedule: "manual",
        size: w.size,
        spec: w.spec,
        createdByUserId: owner.userId,
        titleSetByUser: true,
      });
      add("widgets");
    }
  };
  await widgetsFor(home.id, [
    {
      title: "Receita do mês",
      agent: "norton",
      size: "m",
      spec: {
        kind: "kpi",
        value: 184320,
        prefix: "R$",
        delta: { text: "+12%", up: true },
        note: "contra outubro",
        spark: [120, 132, 128, 150, 161, 170, 184],
      },
    },
    {
      title: "Meta do trimestre",
      agent: "torres",
      size: "s",
      spec: { kind: "goal", pct: 61, line: "R$ 317 mil de R$ 520 mil", note: "No ritmo atual, fecha dia 22." },
    },
    {
      title: "Fila do WhatsApp",
      agent: "miguel",
      size: "m",
      spec: {
        kind: "bars",
        labels: ["Resolvidas", "Aguardando cliente", "Sem resposta", "Escaladas"],
        values: [18, 5, 14, 2],
        unit: "conversas",
        alertIndex: 2,
      },
    },
    {
      title: "Pull requests",
      agent: "ageu",
      size: "m",
      spec: {
        kind: "list",
        rows: [
          { text: "#482 Migração da tabela de pedidos", meta: "revisão", tone: "warn" },
          { text: "#483 Índice composto de pedidos", meta: "aberto" },
          { text: "#479 Atualiza dependências", meta: "mergeado", tone: "ok" },
          { text: "#477 Corrige carrinho no Safari", meta: "mergeado", tone: "ok" },
        ],
      },
    },
  ]);
  const ops = boards.find((b) => b.title === "Operação do estúdio");
  if (ops)
    await widgetsFor(ops.id, [
      {
        title: "Entregas da semana",
        agent: "rollo",
        size: "m",
        spec: { kind: "bars", labels: ["Seg", "Ter", "Qua", "Qui", "Sex"], values: [3, 5, 2, 6, 4], unit: "peças" },
      },
      {
        title: "Tempo de resposta",
        agent: "miguel",
        size: "m",
        spec: {
          kind: "line",
          labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
          values: [42, 38, 35, 31, 29, 33, 27],
          unit: "min",
          note: "Menor tempo do mês na quinta.",
        },
      },
      {
        title: "Satisfação",
        agent: "miguel",
        size: "s",
        spec: { kind: "kpi", value: 4.7, suffix: "/5", delta: { text: "+0,2", up: true }, note: "últimos 7 dias" },
      },
      {
        title: "Deploys",
        agent: "ageu",
        size: "s",
        spec: {
          kind: "kpi",
          value: 14,
          suffix: "na semana",
          delta: { text: "-2", up: false },
          spark: [3, 2, 4, 1, 3, 1],
        },
      },
      {
        title: "Resumo do dia",
        agent: "helena",
        size: "l",
        spec: {
          kind: "text",
          items: [
            "Três entregas aprovadas hoje, uma pendente de revisão da Camila.",
            "O Café Aurora prometeu pagar na sexta, o que fecha o mês com 96% de recebimento.",
            "Atenção: a migração do PR #482 ainda roda em staging e deixa o ambiente lento.",
          ],
        },
      },
    ]);
  const fin = boards.find((b) => b.title.startsWith("Financeiro e comercial"));
  if (fin)
    await widgetsFor(fin.id, [
      {
        title: "Receita por mês",
        agent: "norton",
        size: "l",
        spec: {
          kind: "line",
          labels: ["Jun", "Jul", "Ago", "Set", "Out", "Nov"],
          values: [118, 126, 139, 151, 164, 184],
          unit: "R$ mil",
          note: "Crescimento de 56% em seis meses.",
        },
      },
      {
        title: "Margem",
        agent: "norton",
        size: "s",
        spec: { kind: "kpi", value: 34.1, suffix: "%", delta: { text: "+1,8 pp", up: true } },
      },
      {
        title: "Contas a receber",
        agent: "norton",
        size: "s",
        spec: { kind: "kpi", value: 42800, prefix: "R$", delta: { text: "R$ 9.500 vencidos", up: false } },
      },
      {
        title: "Funil comercial",
        agent: "torres",
        size: "m",
        spec: {
          kind: "bars",
          labels: ["Contato", "Proposta", "Negociação", "Fechado"],
          values: [32, 14, 6, 4],
          unit: "negócios",
        },
      },
      {
        title: "Negociações paradas",
        agent: "torres",
        size: "m",
        spec: {
          kind: "list",
          rows: [
            { text: "Padaria Estrela do Sul", meta: "9 dias", tone: "warn" },
            { text: "Studio Lume", meta: "7 dias", tone: "warn" },
            { text: "Café Aurora", meta: "3 dias" },
          ],
        },
      },
    ]);

  // Approvals waiting: a card message from the agent, the pending row, and the owner's notification.
  const approvalsDefs = [
    {
      agent: "felix",
      channel: "engenharia",
      title: "Fazer merge do PR #482 em main",
      detail: "Migração da tabela de pedidos, 3 arquivos alterados.",
      why: "Testes verdes e aprovado por Rodrigo.",
      tool: "github_merge_pull_request",
      scope: "github:merge",
    },
    {
      agent: "norton",
      channel: "financeiro",
      title: "Enviar a cobrança de R$ 9.500,00 ao cliente Café Aurora",
      detail: "E-mail com boleto atualizado e multa de 2%.",
      why: "Vencido há 17 dias, sem resposta aos dois lembretes.",
      tool: "send_email",
      scope: "mail:send",
    },
    {
      agent: "ageu",
      channel: "engenharia",
      title: "Publicar a versão 2.4.0 em produção",
      detail: "Inclui a correção do carrinho e o índice novo de pedidos.",
      why: "Todos os testes passaram em staging por 24 horas.",
      tool: "deploy_production",
      scope: "deploy:production",
    },
  ];
  for (const d of approvalsDefs) {
    const c = chan(d.channel);
    if (!c || !aid(d.agent)) continue;
    const dup = await db
      .select({ id: schema.approvals.id })
      .from(schema.approvals)
      .where(and(eq(schema.approvals.orgId, orgId), eq(schema.approvals.title, d.title)));
    if (dup.length) continue;
    const card = await insertMessage(db, {
      orgId,
      channelId: c.id,
      author: authorOf(A(d.agent)),
      body: `Preciso da sua aprovação: ${d.title}.`,
      meta: { seed: "demo" },
      createdAt: ago(25),
    });
    const [approval] = await db
      .insert(schema.approvals)
      .values({
        orgId,
        runId: null,
        agentId: aid(d.agent),
        channelId: c.id,
        threadRootId: card.id,
        messageId: card.id,
        toolUseId: `demo-${d.agent}-${Date.now()}`,
        tool: d.tool,
        scope: d.scope,
        params: { demo: true },
        actionHash: `demo-${d.tool}-${d.agent}`,
        title: d.title,
        detail: d.detail,
        why: d.why,
        ownerUserId: owner.userId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        highRisk: true,
      })
      .returning();
    await notify(
      { db, pubsub, now: () => ago(25) },
      {
        orgId,
        userIds: [owner.userId],
        kind: "approval",
        groupKey: `approval:${approval.id}`,
        waiting: true,
        actor: { type: "agent", id: aid(d.agent) },
        source: { channelId: c.id, messageId: card.id, approvalId: approval.id } as never,
        latest: { title: d.title, text: d.why } as never,
      },
    );
    add("aprovações pendentes");
  }

  // More notifications, mixed ages and read state.
  const msgIn = async (name: string) => {
    const c = chan(name);
    if (!c) return null;
    const [m] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.channelId, c.id))
      .limit(1);
    return { channelId: c.id, messageId: m?.id ?? crypto.randomUUID() };
  };
  const [gDesign, gEng, gCom, gAt, gLanc, gFin] = await Promise.all(
    ["design", "engenharia", "comercial", "atendimento", "lancamento-dezembro", "financeiro"].map(msgIn),
  );
  const ag = (h: string) => ({ type: "agent" as const, id: aid(h) });
  const pe = (n: string) => ({ type: "user" as const, id: people(n)! });
  const notes: {
    kind: string;
    key: string;
    waiting?: boolean;
    actor: any;
    src: any;
    latest: any;
    ago: number;
    read?: boolean;
  }[] = [
    {
      kind: "mention",
      key: "m1",
      actor: pe("Camila Ribeiro"),
      src: gLanc,
      latest: { text: "@dock preciso da sua decisão sobre a trilha do vídeo até o fim do dia" },
      ago: 12,
    },
    {
      kind: "mention",
      key: "m2",
      actor: ag("torres"),
      src: gCom,
      latest: {
        text: "@dock a Padaria Estrela do Sul aceitou o desconto de 5% com o contrato anual. Posso enviar o contrato?",
      },
      ago: 55,
    },
    {
      kind: "mention",
      key: "m3",
      actor: pe("Thiago Moura"),
      src: gFin,
      latest: { text: "@dock o Café Aurora confirmou o pagamento para sexta, pode baixar a pendência no relatório" },
      ago: 60 * 6,
      read: true,
    },
    {
      kind: "dm",
      key: "d1",
      actor: pe("Luiza Prado"),
      src: gDesign,
      latest: { text: "Terminei as legendas. Quer revisar antes de eu agendar?" },
      ago: 30,
    },
    {
      kind: "dm",
      key: "d2",
      actor: ag("rollo"),
      src: gDesign,
      latest: {
        text: "Subi a versão 3 do teaser com o ajuste de contraste e a trilha nova, dá uma olhada quando puder",
      },
      ago: 60 * 3,
    },
    {
      kind: "dm",
      key: "d3",
      actor: pe("Ana Beatriz Cavalcanti de Albuquerque Mendonça"),
      src: gFin,
      latest: { text: "Preciso da sua assinatura em dois contratos. Mando por e-mail?" },
      ago: 60 * 26,
      read: true,
    },
    {
      kind: "thread_reply",
      key: "t1",
      actor: ag("ageu"),
      src: gEng,
      latest: { text: "Feito, PR #483 com o índice composto de pedidos aberto e testes passando." },
      ago: 90,
    },
    {
      kind: "thread_reply",
      key: "t2",
      actor: pe("Camila Ribeiro"),
      src: gLanc,
      latest: { text: "Perfeito, vamos com a base do convite do Darlan." },
      ago: 60 * 28,
    },
    {
      kind: "agent_question",
      key: "q1",
      waiting: true,
      actor: ag("miguel"),
      src: gAt,
      latest: {
        title: "Posso oferecer 10% de desconto para quem reclamou da demora?",
        text: "Foram 6 clientes essa semana.",
        suggestions: ["Pode", "Só 5%", "Não"],
      },
      ago: 45,
    },
    {
      kind: "agent_question",
      key: "q2",
      waiting: true,
      actor: ag("helena"),
      src: gDesign,
      latest: {
        title: "Qual das três direções de paleta apresento ao cliente?",
        text: "Terracota, mostarda ou verde-oliva.",
      },
      ago: 60 * 5,
    },
    {
      kind: "run_failed",
      key: "f1",
      actor: ag("felix"),
      src: gEng,
      latest: { text: "O provedor recusou a chave de API. Confira a conta de IA nas configurações." },
      ago: 60 * 7,
    },
    {
      kind: "run_failed",
      key: "f2",
      actor: ag("darlan"),
      src: gDesign,
      latest: { text: "A execução parou: o limite de gastos do mês foi atingido." },
      ago: 60 * 52,
      read: true,
    },
    {
      kind: "reaction",
      key: "r1",
      actor: pe("Thiago Moura"),
      src: gFin,
      latest: { emojis: ["👍", "🎉"], quote: "Resumo de novembro: receita R$ 184.320,00" },
      ago: 60 * 2,
    },
    {
      kind: "reaction",
      key: "r2",
      actor: ag("rollo"),
      src: gDesign,
      latest: { emojis: ["🔥"], quote: "Aprovado! Pode seguir para o resto da série." },
      ago: 60 * 27,
      read: true,
    },
    {
      kind: "reaction",
      key: "r3",
      actor: pe("Camila Ribeiro"),
      src: gLanc,
      latest: { emojis: ["🙏", "👀", "💡"], quote: "Posso receber cadastros pelo WhatsApp como plano B" },
      ago: 60 * 24 * 6,
      read: true,
    },
    {
      kind: "mention",
      key: "m4",
      actor: ag("norton"),
      src: gFin,
      latest: { text: "@dock a conciliação de novembro terminou com 3 pendências. Quer que eu liste?" },
      ago: 60 * 24 * 2,
    },
    {
      kind: "dm",
      key: "d4",
      actor: pe("Rodrigo Nascimento Figueiredo"),
      src: gEng,
      latest: { text: "Posso subir o deploy hoje à noite? Prefiro avisar antes." },
      ago: 60 * 24 * 3,
      read: true,
    },
    {
      kind: "thread_reply",
      key: "t3",
      actor: ag("torres"),
      src: gCom,
      latest: { text: "Atualizei o funil: 2 negociações voltaram para proposta." },
      ago: 60 * 24 * 5,
      read: true,
    },
    {
      kind: "mention",
      key: "m5",
      actor: pe("Luiza Prado"),
      src: gLanc,
      latest: { text: "@dock aprova o texto do convite? Está na pasta do lançamento" },
      ago: 60 * 24 * 7,
      read: true,
    },
    {
      kind: "agent_reply",
      key: "a1",
      actor: ag("helena"),
      src: gDesign,
      latest: { text: "Terminei a análise dos 10 concorrentes: o resumo e o mapa de posicionamento estão na wiki." },
      ago: 60 * 9,
    },
    {
      kind: "run_failed",
      key: "f3",
      actor: ag("miguel"),
      src: gAt,
      latest: { text: "Não consegui acessar o WhatsApp: a sessão expirou e precisa ser reconectada." },
      ago: 60 * 24 * 4,
      read: true,
    },
  ];
  for (const n of notes) {
    if (!n.src) continue;
    const key = `demo:${n.key}`;
    const have = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.orgId, orgId),
          eq(schema.notifications.userId, owner.userId),
          eq(schema.notifications.groupKey, key),
        ),
      );
    if (have.length) continue;
    const at = ago(n.ago);
    await notify(
      { db, pubsub, now: () => at },
      {
        orgId,
        userIds: [owner.userId],
        kind: n.kind as never,
        groupKey: key,
        waiting: n.waiting,
        actor: n.actor,
        source: n.src as never,
        latest: n.latest as never,
      },
    );
    if (n.read)
      await db
        .update(schema.notifications)
        .set({ readAt: at })
        .where(
          and(
            eq(schema.notifications.orgId, orgId),
            eq(schema.notifications.userId, owner.userId),
            eq(schema.notifications.groupKey, key),
          ),
        );
    add("notificações");
  }

  // Nothing the seed wrote may start work when the server boots again: its own queued jobs are closed.
  const closed = await db
    .update(schema.outbox)
    .set({ status: "done", completedAt: new Date() })
    .where(
      and(
        eq(schema.outbox.orgId, orgId),
        eq(schema.outbox.status, "pending"),
        sql`${schema.outbox.createdAt} >= ${startedAt}`,
      ),
    )
    .returning({ id: schema.outbox.id });
  console.log(`Engine part done. Created:`, counts, `(closed ${closed.length} queued jobs)`);
  await handle.close?.();
  process.exit(0);
}

async function findDm(db: any, schema: any, orgId: string, a: string, b: string) {
  const { and, eq, sql } = await import(new URL("../../packages/db/src/index.ts", import.meta.url).href);
  const rows: any[] = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(
      and(
        eq(schema.channels.orgId, orgId),
        sql`${schema.channels.kind} = 'dm'`,
        sql`${schema.channels.id} in (
      select channel_id from channel_members where user_id = ${a}
      intersect select channel_id from channel_members where user_id = ${b})`,
      ),
    );
  return rows[0] as { id: string } | undefined;
}

// ── Entry ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const [mode, arg, orgArg] = process.argv.slice(2);
const orgId = orgArg ?? DEFAULT_ORG;
if (mode === "http" && arg) await runHttp(arg, orgId);
else if (mode === "engine" && arg) await runEngine(arg, orgId);
else {
  console.error(
    "usage: bun scripts/visant/seed-demo.ts http <passwordFile> [orgId]\n       bun scripts/visant/seed-demo.ts engine <pgliteFolder> [orgId]",
  );
  process.exit(1);
}
