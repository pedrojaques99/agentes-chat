/**
 * The fork's upstream card's words (pt-BR and English), kept here rather than in `@agenteschat/i18n`: a key there must
 * be translated into every language people can pick (`packages/i18n/test/locales.test.ts`), so the card would touch
 * 14 upstream files on every merge. Other languages read English.
 */
const ptBR = {
  title: "Projeto original",
  behind: (n: number) =>
    n === 1 ? "O projeto original tem 1 mudança nova" : `O projeto original tem ${n} mudanças novas`,
  upToDate: "Em dia com o projeto original",
  unavailable: "Não deu para verificar agora",
  update: "Atualizar",
  manualHint: "Abre o GitHub: lá você roda a sincronização.",
  more: (n: number) => `e mais ${n}`,
  deployManual: "Publicar em produção continua manual.",
  started: "Sincronização iniciada",
  failed: "Não deu para iniciar a sincronização",
  seeOnGitHub: "Ver no GitHub",
  see: "Ver",
  commitLink: (sha: string) => `Abrir ${sha} no GitHub`,
};

export type UpstreamStrings = typeof ptBR;

const en: UpstreamStrings = {
  title: "Original project",
  behind: (n) => (n === 1 ? "The original project has 1 new change" : `The original project has ${n} new changes`),
  upToDate: "Up to date with the original project",
  unavailable: "Couldn't check now",
  update: "Update",
  manualHint: "Opens GitHub: run the sync there.",
  more: (n) => `and ${n} more`,
  deployManual: "Deploying to production stays manual.",
  started: "Sync started",
  failed: "Couldn't start the sync",
  seeOnGitHub: "See on GitHub",
  see: "See",
  commitLink: (sha) => `Open ${sha} on GitHub`,
};

export const upstreamStrings = (language: string): UpstreamStrings => (language.startsWith("pt") ? ptBR : en);
