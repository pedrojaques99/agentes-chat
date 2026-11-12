import { createRequester, enc } from "@agenteschat/client";
import { relativeTime } from "@agenteschat/client/lib/format";
import { Button, Card, CardHeader, Icon, SettingNote } from "@agenteschat/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PrefRow } from "@/components/NoticePrefs";
import { useOrg } from "@/components/org-context";
import { useToast } from "@/lib/toast";
import { upstreamStrings } from "./upstream-strings";

/*
 * Fork only (pedrojaques99/agentes-chat), in Settings › Workspace for its owner: how many commits the original project
 * has that visant/build doesn't, the newest few, and Atualizar, which starts the sync workflow on GitHub (or opens its
 * page when the server has no `GITHUB_SYNC_TOKEN`). Its own file, rendered with one line in `SettingsPage.tsx`, and its
 * own requests (`apps/server/src/routes/app/visant-upstream.ts`), so upstream merges don't touch it.
 */

export interface UpstreamCommit {
  sha: string;
  message: string;
  author: string;
  date: string | null;
  url: string;
}

export interface UpstreamStatus {
  ok: boolean;
  behind: number | null;
  commits: UpstreamCommit[];
  compareUrl: string;
  workflowUrl: string;
  canTrigger: boolean;
  checkedAt: string;
}

/** Where the card reads and starts the sync (tests pass their own). */
export interface UpstreamSource {
  status(orgId: string): Promise<UpstreamStatus>;
  sync(orgId: string): Promise<{ started: true; runsUrl: string }>;
}

const request = createRequester();
const path = (orgId: string) => `/api/app/organizations/${enc(orgId)}/visant/upstream`;

export const httpUpstream: UpstreamSource = {
  status: (orgId) => request<UpstreamStatus>(path(orgId)),
  sync: (orgId) => request<{ started: true; runsUrl: string }>(`${path(orgId)}/sync`, { json: {} }),
};

const openTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export function UpstreamCard({ source = httpUpstream }: { source?: UpstreamSource }) {
  const { org } = useOrg();
  if (org.role !== "owner") return null;
  return <UpstreamCardBody orgId={org.id} source={source} />;
}

function UpstreamCardBody({ orgId, source }: { orgId: string; source: UpstreamSource }) {
  const { t, i18n } = useTranslation();
  const s = upstreamStrings(i18n.language);
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["visant-upstream", orgId];
  const status = useQuery({ queryKey: key, queryFn: () => source.status(orgId), staleTime: 60_000, retry: false });
  const [runsUrl, setRunsUrl] = useState<string | null>(null);
  const sync = useMutation({
    mutationFn: () => source.sync(orgId),
    onSuccess: (r) => {
      setRunsUrl(r.runsUrl);
      toast.show(s.started, "success", { label: s.seeOnGitHub, run: () => openTab(r.runsUrl) });
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.show(s.failed, "error"),
  });

  const data = status.data;
  const failed = status.isError || (data && !data.ok);
  const behind = data?.ok ? (data.behind ?? 0) : 0;
  const subtitle = failed ? s.unavailable : data ? (behind > 0 ? s.behind(behind) : s.upToDate) : undefined;

  const action =
    data?.ok && behind > 0 ? (
      data.canTrigger ? (
        <Button size="sm" variant="primary" icon="refresh" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {s.update}
        </Button>
      ) : (
        <Button asChild size="sm" variant="primary">
          <a href={data.workflowUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} />
            {s.update}
          </a>
        </Button>
      )
    ) : undefined;

  return (
    <Card aria-labelledby="sec-upstream">
      <CardHeader id="sec-upstream" icon="gitPull" title={s.title} subtitle={subtitle} action={action} />
      {data?.ok && behind > 0 && (
        <div className="settings-rows">
          {data.commits.map((c) => (
            <PrefRow
              key={c.sha}
              id={`upstream-${c.sha}`}
              icon="gitPull"
              label={c.message}
              status={[c.author, c.date && relativeTime(t, i18n.language, c.date)].filter(Boolean).join(" · ")}
              control={
                <Button asChild size="sm" variant="link">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" aria-label={s.commitLink(c.sha)}>
                    {c.sha}
                  </a>
                </Button>
              }
            />
          ))}
        </div>
      )}
      {data?.ok && behind > data.commits.length && (
        <Button asChild size="sm" variant="link">
          <a href={data.compareUrl} target="_blank" rel="noopener noreferrer">
            {s.more(behind - data.commits.length)}
          </a>
        </Button>
      )}
      {data?.ok && behind > 0 && !data.canTrigger && (
        <SettingNote icon="info" quiet>
          {s.manualHint}
        </SettingNote>
      )}
      {runsUrl && (
        <Button asChild size="sm" variant="link">
          <a href={runsUrl} target="_blank" rel="noopener noreferrer">
            {s.seeOnGitHub}
          </a>
        </Button>
      )}
      <SettingNote icon="info" quiet>
        {s.deployManual}
      </SettingNote>
    </Card>
  );
}
