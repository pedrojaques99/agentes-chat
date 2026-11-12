# Plano: agentes-chat 1:1 com o Tucano (Visant)

Meta: o agentes-chat operando de ponta a ponta com o mesmo time do Tucano. Os bots locais pensam no PC, os da nuvem (Miguel e Vicent) no VPS. Todos usam Claude Code do plano e têm Figma, Premiere, jaques-os, Visant Labs, visant-board, Linear etc.
Fork: `pedrojaques99/agentes-chat`, branch `visant/build`. Upstream intocado.
Licença: AGPL-3.0. Código do Tucano (Apache-2.0) pode entrar aqui; o caminho inverso não.

## O que o agentes-chat já tem (só configurar)

| Tucano | agentes-chat | Onde |
|---|---|---|
| Harness Claude Code do plano | brain `claude_code` num computador conectado | `apps/server/runner/brain.ts` |
| Nó local (PC empresta ao servidor) | runner pareado por WebSocket de saída | `runner/pairing.ts`, `irm <server>/i/<code>/ps \| iex` |
| Conectores remotos OAuth/token | conectores do workspace (DCR + Bearer) | `packages/engine/src/connectors/*` |
| Skills, memória, wiki, rotinas, aprovações | tudo nativo | ADR 0020/0023/0053/0120/0167 |
| Passar a vez, devolver, roteador com fallback | `no_reply`, `ask_agent`/`tell_agent`/`handBack`, cadeia do router | ADR 0034/0074/0095 |
| Uso por pessoa, freio de autonomia | ADR 0141, `stretch.ts` / `stuck.ts` | |
| Navegador | Chrome do runner (Win x64, Mac) | `runner/browser.ts` |

## Lacunas que o fork fecha

1. **MCPs locais no Claude do PC** (Premiere stdio, workspace-mcp, Figma desktop `127.0.0.1:3845`). Hoje o runner já sabe carregar o `~/.claude.json` do dono (`personalMcp`), mas o servidor nunca liga isso. O fork adiciona a coluna `agents.personal_mcp`, passa o valor em `apps/server/src/engine.ts` e põe um switch na página do agente.
2. **Import com cérebro e computador.** O bundle de import não define `brain`/`machine`/conectores. O fork estende `BundleAgent`, e `scripts/visant/tucano-export.ts` gera o bundle a partir do `tucano.db`.
3. **Figma da loja.** `mcp.figma.com` recusa clientes fora da allowlist, como no Tucano. Com a lacuna 1 resolvida, o Claude do PC usa o Figma que já está logado no Claude Code.
4. **jaques-os.** Não tem MCP. O agente local opera pelo shell (`node desktop/supervisor.js status|up|down`) e pela API HTTP local. Sai skill/instrução, não código.

## Fases

| # | Fase | Feito quando |
|---|---|---|
| 1 | Servidor no VPS: compose + Postgres atrás do Traefik do Coolify, `https://agentes.visant.co` | a página de login abre com HTTPS |
| 2 | Conta do dono + workspace Visant + contexto da org | logado |
| 3 | Computador VPS: runner no host (usuário `agentes`) + `claude` logado no plano | aparece online; Miguel/Vicent respondem |
| 4 | Computador PC Windows: runner pareado + Claude Code do PC | Rollo/Félix/Ageu/Torres/Norton/Darlan respondem pensando no PC |
| 5 | Conectores: visant-labs, visant-board (Bearer), Linear, Sentry, Context7, Supabase (leitura) | ferramentas listadas e um teste de leitura em cada |
| 6 | Lacuna 1 (MCP pessoal) com imagem própria do fork | Rollo usa o Premiere e Darlan o Figma a partir do chat |
| 7 | Import: time Visant + #visant-team + skills `visant-*`; Miguel/Vicent a partir do SOUL do Hermes | canais e agentes iguais aos do Tucano |
| 8 | Rotinas do Vicent (briefing 8h, fechamento sexta 17h, social segunda 9h) | primeira execução registrada |
| 9 | Comparação 1:1: mesmas 10 tarefas nos dois apps, com tabela de resultado | `docs/visant/COMPARACAO.md` |

O Hermes continua ligado durante o teste. Nada dele é desligado.

## Estado (12/11)

- [x] Fase 1: `https://agentes.visant.co` no ar (Traefik do Coolify, Let's Encrypt, DNS A na GoDaddy). Imagem própria `agentes-visant:<sha>` construída de `/opt/agentes/src`.
- [x] Lacuna 1 (MCP pessoal) no código e em produção.
- [x] Computador do servidor: usuário `agentes` (modo simples, Ubuntu sem BPF), Node 24 em `/opt/node24`, Claude Code pelo npm, Chromium pelo apt, runner `host` como serviço de usuário (`journalctl --user -u agentes-runner`). Esperando a primeira org.
- [x] Pacotes de import em `~/Downloads/agentes-import/` (time do Tucano + Vicent do Hermes, sem segredos).
- [x] **Prova local de ponta a ponta (12/11)**, numa instância de teste em `localhost:3300` (PGlite), com o time importado do Tucano:
  - PC pareado pelo runner do fork (`bun apps/server/runner/main.ts pair|start`);
  - Rollo com `claude_code`, a conta Claude Max do PC e "Usar meus MCPs deste computador" ligado;
  - pelo chat, ele listou cerca de 382 ferramentas do Premiere e as do Figma, e rodou `node desktop/supervisor.js status` no jaques-os (8 de 26 serviços no ar). Resposta em cerca de 20 s.
- [x] Conta de dono e workspace **Visant**; Claude Max logado no computador do servidor.
- [x] Import em produção: o time do Tucano (7) mais o #visant-team; o Vicent pelo Hermes (2 skills, 3 rotinas, 3 memórias).
- [x] Cérebros:
  - Miguel e Vicent no `srv1591821`, com `claude_code` e a conta Max;
  - Rollo, Félix, Ageu, Torres, Norton e Darlan no **PC Visant**, com `claude_code`, a conta do PC e `personalMcp` ligado.
- [x] **Prova em produção (12/11):**
  - Rollo pelo chat: 384 ferramentas do Premiere, Figma e jaques-os (`supervisor.js status`);
  - Vicent: `hostname` = srv1591821, skills da casa, rotina das 8h.
- [ ] Conectores: Visant Labs e visant-board (o dono cola a chave), Linear (o dono autoriza o OAuth).
- [ ] Runner do PC como serviço: o dono roda `bun apps/server/runner/main.ts service install` em `Z:\Cursorgentes-chat` (o classificador bloqueia que eu crie a tarefa).
- [ ] Teste 1:1 das 10 tarefas.

Atualizar a imagem: `cd /opt/agentes/src && git pull && docker build -t agentes-visant:$(git rev-parse --short HEAD) .`, trocar `AGENTES_IMAGE` no `.env` e `docker compose up -d`.

## O que depende do dono

- Login do Claude Code no VPS (uma vez, pelo app: Contas de IA) e no PC (já existe).
- Reautorizar os conectores OAuth (Linear, Sentry, Supabase) no novo app.
