# Tucano × agentes-chat: comparação lado a lado

12 de novembro de 2026. Base: medições nos dois repositórios (branch `visant/build` de cada fork), leitura do código e o deploy real do agentes-chat no VPS da Visant feito hoje. As notas vão de 1 a 5. Notas de "uso no dia a dia" valem como hipótese até o teste prático 1:1 (fase 9 do `PLANO-paridade.md`).

## Resumo em uma tela

| Critério | Peso | Tucano | agentes-chat | Por quê, em uma linha |
|---|---:|:---:|:---:|---|
| Uso em time (2 pessoas + agentes) | 15 | 2,0 | **4,5** | Tucano é de uma pessoa no desktop, e o modo servidor é experimental. O agentes-chat nasceu multi-pessoa, com convites, papéis, presença, web, desktop e celular. |
| Integração local (Premiere, Figma, jaques-os, CLIs no Windows) | 15 | **4,5** | 3,0 | Tucano roda os MCPs stdio e os apps do PC direto. No agentes-chat isso só funciona via Claude Code com o switch que o fork adicionou. Codex e Cursor são recusados no Windows, e não há controle de desktop no Win/Mac. |
| Recursos de agente | 10 | 3,5 | **4,5** | Os dois têm rotinas, aprovações, memória, skills, roteador, passar a vez, retomada e freios. Só o agentes-chat tem caixa de e-mail, painéis, enquetes, kanban, voz e evals amplos. |
| Segurança | 10 | 3,0 | **4,5** | O agentes-chat tem log de auditoria, CSRF, criptografia em envelope, papéis com permissão por chave, um usuário de SO por agente (Linux) e varredura de segredos no CI. |
| UI/UX e design | 10 | 3,5 | **4,0** | Tucano tem a cara e o fluxo da Visant, com o polimento recente. O agentes-chat tem design system próprio (78 componentes), 14 idiomas, 8× mais `aria-` e app nativo, mas é genérico. |
| Engenharia (higiene) | 8 | 2,5 | **4,5** | Tucano não tem lint nem ADR e carrega falhas de teste conhecidas. O agentes-chat tem Biome, 169 ADRs, checagens de fronteira, licença e migração, e CI com 14 jobs. |
| Infra e deploy | 8 | 3,0 | **4,0** | O agentes-chat subiu hoje em Docker atrás do Coolify, com HTTPS, em cerca de 1 hora. O servidor do Tucano é Node + systemd, sem teste real de turno de agente. |
| Modularidade | 6 | 2,5 | **4,5** | O agentes-chat tem 4 apps, 11 pacotes, adapters e module API. O Tucano é um pacote só, com arquivos de 2–3 mil linhas. |
| Escalabilidade | 6 | 1,5 | **4,5** | Tucano: SQLite num processo. O agentes-chat tem Postgres, outbox, LISTEN/NOTIFY e cross-replica. |
| Performance percebida | 4 | **3,5** | 3,0 | Tucano é local e leve (bundle de 628 KB gzip). O agentes-chat passa pelo servidor e a suíte dele é pesada. A medir no teste 1:1. |
| Sofisticação e modernidade | 3 | 3,0 | **4,5** | Stacks igualmente atuais (React 19, TS 7, Vite 8). O agentes-chat soma Bun, Hono, Drizzle, Tauri 2 e Expo. |
| Controle, licença e custo de manter o fork | 5 | **4,5** | 2,0 | Tucano: Apache-2.0, 64 mil linhas que a gente conhece. O agentes-chat é AGPL, tem 750 mil linhas e um upstream que faz cerca de 260 commits por dia, com 2 autores. |
| **Total ponderado** | 100 | **3,11** | **4,00** | |

**Leitura:** como plataforma para o time, o agentes-chat é mais maduro em quase tudo. O Tucano ganha em dois pontos que pesam muito para a Visant: os apps locais do seu PC e o controle total do código.

**Mudança de leitura em relação à análise anterior.** A primeira análise (3,83 × 2,90 a favor do Tucano) dava peso máximo à integração local e via o agentes-chat sem MCP local. Desde então, duas coisas mudaram:
- Medindo, a distância de maturidade é grande. São 14,5 mil testes contra 1,6 mil, 169 ADRs contra nenhum, e auditoria, CSRF e isolamento que o Tucano não tem.
- A lacuna do MCP local caiu com um patch de uma coluna (`brain_personal_mcp`), porque o runner já sabia fazer.

## O que pesa contra cada um

### Tucano
- **Servidor e time são experimentais.** Um turno real de agente no servidor só foi testado com o motor de teste (`docs/server.md:5`). Para o time, isso é a base que falta.
- **Higiene:**
  - sem linter, formatter ou checagem de camadas;
  - sem ADRs e com 9 docs;
  - falhas de teste conhecidas na base (5 em arquivos já identificados e cerca de 100 numa rodada completa no Windows).
- **Segurança:**
  - sem log de auditoria (só `activity`);
  - sem token CSRF;
  - sem isolamento de SO por agente;
  - Mac não notarizado.
- **Não escala:** SQLite num processo e SSE.
- **Sem app de celular:** só pareamento e Telegram.
- **Bundle num pedaço só:** 2,7 MB de JS, sem code splitting.

### agentes-chat
- **AGPL-3.0.** Quem usar pela rede tem direito ao código das modificações. Para uso interno da Visant com o fork público no GitHub, isso já está cumprido. Pesa se um dia virar produto fechado.
- **Fork contra um upstream muito rápido** (cerca de 7,5 mil commits em 29 dias, 98% de 2 pessoas). Cada patch nosso precisa ser rebaseado e pode quebrar. O ideal é mandar os patches pra cima (o do MCP pessoal é candidato).
- **Mais peças:** Postgres, container, runner em cada computador e Traefik. Hoje isso já custou dois tropeços:
  - o nome `postgres` colidia com o banco de outro app na rede do Coolify;
  - o instalador oficial baixa scripts como root e foi bloqueado. Fizemos com npm e apt.
- **Windows é cidadão de segunda.** Só o Claude Code roda no Windows; Codex, Cursor, OpenCode e Grok são recusados. O controle de desktop é só no Linux.
- **Suíte pesada:** um arquivo de teste leva 28 s, e o CI usa 5 shards.
- **Recursos condicionados.** Alguns só existem na Cloud ou com variável de ambiente (Composio, triagem de sessão, rate limiter Redis).

## Por dimensão (fatos)

| | Tucano | agentes-chat |
|---|---|---|
| Código (sem teste) | 63,9 mil linhas, 212 arquivos | 751,8 mil linhas, 2.564 arquivos |
| Testes | 162 arquivos, 1.628 casos (Vitest) | 1.339 arquivos, 14.502 casos (bun test + PGlite) |
| Lint e checagens | nenhum | Biome, shellcheck, boundaries, licenses, migrations, geometry |
| CI | 6 workflows (typecheck, testes, instaladores) | 5 workflows; o `ci.yml` tem 14 jobs, incluindo varredura de segredos e teste de isolamento root |
| Decisões documentadas | 0 ADRs | 169 ADRs |
| Banco | SQLite (`node:sqlite`), 80 migrações, 27 tabelas, 15 índices | Postgres + Drizzle, 251 migrações imutáveis, 163 tabelas, 254 índices |
| Tempo real | SSE (servidor), IPC (desktop) | WebSocket + pub/sub Postgres |
| Multi-tenant | um workspace por instalação | multi-org, `org_id` em toda tabela |
| Segredos | keychain do SO (desktop) ou AES-256-GCM com arquivo de chave (servidor) | criptografia em envelope com HKDF por finalidade, mais um cofre de logins |
| Auth | token bearer, chave por pessoa, códigos de pareamento | Better Auth (sessão + CSRF, Google/Apple), papéis com permissões por chave |
| Sandbox de comandos | ferramentas do harness desligadas, MCP estrito, computador Docker | política de comandos com lista de bloqueio, um usuário de SO por agente (Linux), git-guard, egress |
| Auditoria | não | `audit_log` de pessoas e de chamadas de ferramenta (entrada mascarada) |
| Plataformas | Win x64, Mac arm/x64 (não notarizado), Linux | Mac universal, Win x64/arm64, Linux, iOS e Android, binários do runner |
| i18n | pt, en | 14 idiomas |
| Acessibilidade (`aria-`) | 295 | 2.270 |
| Licença | Apache-2.0 | AGPL-3.0-only |
| Histórico | 89 commits (re-enraizado em 08/11) | 7.573 commits desde 14/10 |

## Recursos de agente

| Recurso | Tucano | agentes-chat |
|---|---|---|
| Rotinas | sim | sim, mais gatilho por webhook |
| Aprovações | sim, presas ao hash da chamada | sim, com política por autoridade (pessoa, rotina, autônomo) |
| Memória / wiki | sim (wiki em git) | sim (busca híbrida com vetores, aprendizado próprio) |
| Skills | sim, nativas do Claude Code | sim, como ferramenta `load_skill`; nativas também com o MCP pessoal ligado |
| Roteador | sim, com fallback para regras | sim, cadeia de fallback |
| Passar a vez / devolver trabalho | sim | sim |
| Navegador | sim | sim (Chrome do runner; Chromium no VPS) |
| Controle de apps do PC | sim (acessibilidade + nó local) | não no Win/Mac; desktop virtual no Linux |
| MCP local (stdio, localhost) | sim | sim, pelo Claude Code, com o switch do fork |
| MCP remoto com OAuth | sim | sim, mais Composio |
| Caixa de e-mail do agente | não | sim |
| Painéis, enquetes, blocos vivos | não | sim |
| Kanban / tarefas | não | sim |
| Voz | só ditado | mensagens de voz |
| Evals com modelo real | roteador | 13 suítes |
| Freios de autonomia | sim | sim, com relatório diário |
| Retomada após limite do plano | sim | sim |
| Uso por pessoa | sim | sim |

## Como decidir: o teste 1:1

As mesmas tarefas nos dois apps, com o mesmo time e o mesmo plano Claude, anotando quantas mensagens até ficar pronto, se pediu aprovação na hora certa e o tempo até a primeira resposta:

1. Reel de 30 s no Premiere a partir de uma trilha (Rollo, MCP local)
2. Três variações de logo no Figma (Darlan, Figma desktop)
3. Status dos serviços do jaques-os e subir um que caiu (Ageu, shell local)
4. Briefing da manhã do board (Vicent, rotina na nuvem)
5. Quem não pagou este mês (Norton, visant-board)
6. Prospecção de 10 estúdios no Behance (Torres, navegador)
7. Demanda nova de cliente no Linear + board (Miguel)
8. "Pode" depois de uma pergunta do agente (roteador)
9. Dois pedidos ao mesmo tempo, de duas pessoas (time)
10. O plano acaba no meio de uma tarefa (retomada)

**Hipótese a confirmar:** o agentes-chat fica como plataforma do time. O Tucano só volta a ganhar se as tarefas 1 a 3 (apps locais) forem claramente piores no agentes-chat no uso real.
