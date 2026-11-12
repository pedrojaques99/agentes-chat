# Auditoria de UI: agentes-chat (web)

12/11/2026. Processo visant-killer (T2 por rota, com gate + telas abertas). Instância local de teste (`localhost:3300`, PGlite), workspace "Visant Teste" com o time real importado do Tucano (7 agentes, #visant-team, 23 skills, 130 memórias).

## Veredito

Nível alto. Não é slop. É um produto com identidade própria e acabamento de time sênior. Os defeitos que achei são de polimento (duplicação, rótulo, título), não de concepção.

## Gate (killer-scan, mesma régua nos dois apps)

| | agentes-chat `apps/web/src` | Tucano `src/renderer/src` |
|---|---|---|
| Arquivos de interface | 462 | 47 |
| Linhas (tsx + css) | 198.067 | 33.727 |
| Tiques de IA (impeccable) | **zero** | **zero** |
| Token (cor crua) | 161 → 0,81 a cada mil linhas | 81 → 2,40 a cada mil linhas |
| Copy (tiques de voz) | 198 → 1,00 a cada mil linhas | 91 → 2,70 a cada mil linhas |
| Ruído de chrome | 105 → 0,53 a cada mil linhas | 60 → 1,78 a cada mil linhas |
| **Total** | **2,34 a cada mil linhas** | **6,88 a cada mil linhas** |

Leitura dos achados do agentes-chat:
- **Token.** A maioria é `#000` dentro de `mask-image`, que é como se escreve máscara em CSS (falso positivo), e branco sobre scrim em telas de arte (`arrival.css`, `install.css`).
- **Copy.** Quase tudo é o separador " · ", que é escolha de estilo e o Tucano também usa.
- **Ruído.** O que vale olhar é `tag-everywhere` (25), papel do agente em etiqueta com borda, e `arrow-glyph` (12), por exemplo `↵` em `Kbd` (`WikiRichEditor.tsx:608`, `:631`; `WikiEditor.tsx:236`). Dentro de tecla de atalho o glifo é aceitável.

## Telas abertas

| Rota | Superfície | Acabamento | O que vi |
|---|---|---|---|
| `/signup` | A aquisição | shine | Cadastro em conversa com o mascote, paisagem em pixel-art com o time. Momento de marca forte. |
| `/onboarding` | A | shine | Cada opção com ilustração própria, prévia viva do workspace à direita, guia (Lodi) à esquerda. Import embutido no passo 3, com prévia que preenche a barra lateral ao vivo. "O seu time está pronto, só falta uma IA para ele acordar": time dormindo sob céu de pixel. |
| `#canal` | B trabalho | alive | Estado vazio com mascote e sugestões já com @agente do time, aviso de "sem IA" com ação, painel de membros. |
| cartão do agente | B | alive | Cartão estilo Slack com banner, presença, responsável, orçamento, mensagem direta. |
| `/agents/:id` | B | alive | Banner em pixel, construtor de avatar (olhos, chapéu, cor), abas, checklist "Para o Rollo começar" com progresso, seções laterais. |
| `/home` | B | sober | Saudação, compositor para o Lodi, widgets "Esperando você" e "Trabalhando agora". É o mais genérico do app. |
| menu do workspace | B | alive | Tela cheia com chão em pixel, ações claras. |

## Defeitos confirmados

1. **Linha "Computador" duplicada** no painel "Como trabalha" da visão geral do agente. O cartão diz "Sem computador ainda · Escolher um computador" (`apps/web/src/pages/agent/ComputerNow.tsx:95`) e logo abaixo a linha diz "Nenhum computador · Não roda programas nem guarda arquivos" (`apps/web/src/pages/agent/Work.tsx:266`). São duas portas para o mesmo dado na mesma tela.
2. **Título da aba genérico e em inglês** em toda rota que não é canal nem notificações. A página do agente, o Início e outras ficam com "agentes.chat · Your team and your agents, in the same conversation" (`apps/web/index.html:8`). Só canais (`#visant-team · Visant Teste`) e notificações (`NotificationsPage.tsx:1356`) definem título próprio. Com várias abas abertas, não dá para achar a do agente.
3. **"Responde a: Ninguém"** como padrão de um agente recém-importado (configurações do agente, Identidade e jeito). Parece erro. O padrão do import deveria ser a pessoa que importou, ou o texto deveria dizer o que significa.
4. **Busca do cabeçalho com dois "×"** no filtro "em: #canal": um no chip e outro no campo, lado a lado. Visto em tela; a linha ainda não foi confirmada no código.

## Proposta de gosto (não são defeitos; o dono escolhe linha a linha)

| # | Onde | Proposta |
|---|---|---|
| a | Barra lateral | O papel de cada agente aparece em etiqueta com borda, mais um alfinete por linha. Texto simples e alfinete só no hover deixariam a lista mais leve. |
| b | Início | É a tela mais sem cara. Os widgets vazios podiam ter o mesmo cuidado dos estados vazios do canal (mascote, sugestão de ação). |
| c | Onboarding, passo 3 | O cartão "Outro app" ocupa sozinho a última linha da grade, em largura total. |

## Comparado ao Tucano

O Tucano tem a cara da Visant e o polimento recente. O agentes-chat tem uma identidade própria mais forte e mais consistente:
- um sistema de mascotes em pixel que aparece em cadastro, onboarding, estados vazios, banners e avatares;
- 78 componentes compartilhados;
- 14 idiomas;
- 8× mais rótulos de acessibilidade.

Pela régua do gate ele sai 3× mais limpo por linha. Onde o Tucano ainda ganha é ter sido desenhado em cima da Visant: as telas falam a língua da agência. No agentes-chat, a marca é a dele.

## Não checado

- Largura de celular (390px): a janela não aceitou redimensionar. O agentes-chat tem app nativo para celular, que também não foi aberto.
- Tema claro.
- Telas com IA conectada e conversa real (mensagens, passos, aprovações), porque a instância de teste não tem IA.
- Configurações do workspace por dentro, Tarefas, Drive, Rotinas.
- Teclado e foco.
- Movimento a 25% de velocidade.
- Backend fora do ar.
