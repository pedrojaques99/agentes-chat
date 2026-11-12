import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/components/org-context";
import { useToast } from "@/lib/toast";
import { httpUpstream, type UpstreamSource } from "./UpstreamCard";
import { upstreamStrings } from "./upstream-strings";

/** The newest upstream commit the owner was already told about, per workspace, on this device. */
const seenKey = (orgId: string) => `visant.upstream.seen.${orgId}`;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // Private window: the notice may show again next time, nothing else breaks.
  }
};

/**
 * Fork only: when the original project has changes this fork doesn't, the owner hears it once (a toast with "Ver",
 * opening the Projeto original card in Settings › Workspace). Once per newest upstream commit, so the same news never
 * repeats; a new commit upstream brings it back. Shares the card's query, so no extra call to GitHub.
 */
export function UpstreamNotice({ source = httpUpstream }: { source?: UpstreamSource }) {
  const { org } = useOrg();
  if (org.role !== "owner") return null;
  return <Notice orgId={org.id} source={source} />;
}

function Notice({ orgId, source }: { orgId: string; source: UpstreamSource }) {
  const { i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const status = useQuery({
    queryKey: ["visant-upstream", orgId],
    queryFn: () => source.status(orgId),
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: false,
  });
  const newest = status.data?.ok && status.data.behind ? status.data.commits[0]?.sha : undefined;
  const behind = status.data?.behind ?? 0;
  useEffect(() => {
    if (!newest || read(seenKey(orgId)) === newest) return;
    write(seenKey(orgId), newest);
    const s = upstreamStrings(i18n.language);
    toast.show(s.behind(behind), "info", {
      label: s.see,
      run: () => void navigate({ to: "/org/$orgId/settings/$section", params: { orgId, section: "general" } }),
    });
  }, [newest, behind, orgId, toast, navigate, i18n.language]);
  return null;
}
