import { useSetChatPrefs } from "@agenteschat/client";
import {
  CHAT_STYLES,
  CHAT_TEXT_SIZES,
  type ChatOpenAt,
  type ChatStyle,
  type ChatTextSize,
  type ChatTone,
  chatLookOf,
  facesShown,
  openAtOf,
  textSizeOf,
} from "@agenteschat/client/lib/chat-look";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import {
  type AgentColor,
  Avatar,
  agentGradient,
  Card,
  CardHeader,
  cx,
  Message,
  MessageLookContext,
  MessageText,
  Segmented,
} from "@agenteschat/ui";

import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PrefRow } from "@/components/NoticePrefs";
import { useOrg } from "@/components/org-context";
import { useToast } from "@/lib/toast";

/** The agent of the samples, the pixel face a DM has. */
const SAMPLE_AGENT = { color: "green" as AgentColor, name: "Ada" };

type Who = "me" | "agent";
interface Line {
  who: Who;
  text: string;
  time: string;
  /** Its place in its author's run. */
  run?: "solo" | "start" | "mid" | "end";
}

/** A few real rows, drawn by the conversation's own code and scaled down. */
function SampleRows({ lines, children }: { lines: Line[]; children?: (line: Line, row: ReactNode) => ReactNode }) {
  const { me } = useOrg();
  return lines.map((line) => {
    const agent = line.who === "agent";
    const run = line.run ?? "solo";
    const row = (
      <Message
        key={line.text}
        agent={agent}
        own={!agent}
        run={run}
        grouped={run === "mid" || run === "end"}
        avatar={
          agent ? (
            <AgentAvatar name={SAMPLE_AGENT.name} appearance={{ color: SAMPLE_AGENT.color }} />
          ) : (
            <Avatar kind="person" name={me.user.name} imageUrl={me.user.image ?? undefined} />
          )
        }
        author={agent ? SAMPLE_AGENT.name : me.user.name}
        time={line.time}
      >
        <MessageText>
          <div className="md md--message">
            <p>{line.text}</p>
          </div>
        </MessageText>
      </Message>
    );
    return children ? children(line, row) : row;
  });
}

function Mini({
  className,
  look,
  size,
  faces = true,
  children,
}: {
  className?: string;
  look: ChatStyle;
  /** Its own Tamanho do texto: the looks' small pictures stay at the default, the size's preview shows the choice. */
  size: ChatTextSize;
  faces?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx("chat-look__mini", className)} data-text-size={size} aria-hidden="true" inert>
      <span className="channel__messages" data-look={look} data-faces={faces ? undefined : "false"}>
        {children}
      </span>
    </span>
  );
}

/**
 * Sua conta › Conversa: how conversations look to me, on every device. Channels and DMs each have their own style (a
 * DM has two speakers, so bubbles say who spoke), Bolhas its Clara or Forte, the size of the words in all of them, and
 * where a conversation opens.
 */
export function ChatLookSettings() {
  const { t } = useTranslation();
  const { org } = useOrg();
  const set = useSetChatPrefs(org.id);
  const toast = useToast();
  const [kind, setKind] = useState<"channels" | "dms">("channels");
  const dm = kind === "dms";
  const prefs = org.chatPrefs;
  // What shows checked is what the conversations use: in a personal workspace, bubbles for channels too (ADR 0159).
  const { style, tone } = chatLookOf(prefs, dm, isPersonal(org));
  const textSize = textSizeOf(prefs);
  const openAt = openAtOf(prefs);
  const save = (patch: Parameters<typeof set.mutate>[0]) =>
    set.mutate(patch, { onError: () => toast.show(t("settings.account.activityFailed")) });
  const mine = agentGradient(dm ? SAMPLE_AGENT.color : "sky")[1];
  // A personal workspace calls its channels group conversations (ADR 0159).
  const toneLabel = dm ? "settings.account.chat.toneDms" : modeKey(org, "settings.account.chat.toneChannels");
  const lookOf = (s: ChatStyle) => ({ style: s, tone, mine, names: !dm, faces: facesShown(s, dm) });
  const talk: Line[] = [
    { who: "me", text: t("settings.account.chat.sample.ask"), time: "14:30" },
    { who: "agent", text: t("settings.account.chat.sample.answer"), time: "14:31" },
    { who: "me", text: t("settings.account.chat.sample.go"), time: "14:32" },
  ];
  const names: Record<ChatStyle, string> = {
    comfortable: t("settings.account.chat.comfortable"),
    left: t("settings.account.chat.left"),
    bubbles: t("settings.account.chat.bubbles"),
    compact: t("settings.account.chat.compact"),
  };
  const sizes: Record<ChatTextSize, string> = {
    xs: t("settings.account.chat.textXs"),
    sm: t("settings.account.chat.textSm"),
    md: t("settings.account.chat.textMd"),
    lg: t("settings.account.chat.textLg"),
    xl: t("settings.account.chat.textXl"),
  };
  const kindSwitch = (
    <Segmented
      size="sm"
      label={t("settings.account.chat.where")}
      value={kind}
      onValueChange={(v) => setKind(v as "channels" | "dms")}
      options={[
        { value: "channels", label: t(modeKey(org, "settings.account.chat.channels")) },
        { value: "dms", label: t("settings.account.chat.dms") },
      ]}
    />
  );
  // One preview, the conversation as it will look with every choice below; each choice is one compact control.
  return (
    <Card aria-labelledby="account-chat">
      <CardHeader id="account-chat" title={t("settings.account.chat.title")} action={kindSwitch} />
      <div className="settings-rows">
        <div className="chat-look__group">
          <MessageLookContext.Provider value={lookOf(style)}>
            <Mini className="chat-look__mini--real" look={style} size={textSize} faces={facesShown(style, dm)}>
              <SampleRows lines={talk} />
            </Mini>
          </MessageLookContext.Provider>
        </div>
        <PrefRow
          id="chat-look-density"
          icon="layers"
          label={t("settings.account.chat.density")}
          hint={t("settings.account.chat.densityHelp")}
          control={
            <Segmented
              size="sm"
              label={t("settings.account.chat.density")}
              value={style}
              onValueChange={(v) => save(dm ? { dmStyle: v as ChatStyle } : { channelStyle: v as ChatStyle })}
              options={CHAT_STYLES.map((v) => ({ value: v, label: names[v] }))}
            />
          }
        />
        {style === "bubbles" && (
          <PrefRow
            id="chat-look-tone"
            icon="bulb"
            label={t(toneLabel)}
            hint={t(dm ? "settings.account.chat.toneDmsHelp" : "settings.account.chat.toneChannelsHelp")}
            control={
              <Segmented
                size="sm"
                label={t(toneLabel)}
                value={tone}
                onValueChange={(v) => save(dm ? { dmTone: v as ChatTone } : { channelTone: v as ChatTone })}
                options={[
                  { value: "light", label: t("settings.account.chat.toneLight") },
                  { value: "strong", label: t("settings.account.chat.toneStrong") },
                ]}
              />
            }
          />
        )}
        <PrefRow
          id="chat-look-size"
          icon="bold"
          label={t("settings.account.chat.textSize")}
          hint={t("settings.account.chat.textSizeHelp")}
          control={
            <Segmented
              size="sm"
              label={t("settings.account.chat.textSize")}
              value={textSize}
              onValueChange={(v) => save({ textSize: v as ChatTextSize })}
              options={CHAT_TEXT_SIZES.map((v) => ({
                value: v,
                // An A in the step's own size; its name for screen readers and on hover.
                label: (
                  <>
                    <span className="chat-look__a" data-text-size={v} aria-hidden="true">
                      A
                    </span>
                    <span className="ac-visually-hidden">{sizes[v]}</span>
                  </>
                ),
                title: sizes[v],
              }))}
            />
          }
        />
        <PrefRow
          id="chat-look-open"
          icon="arrowDown"
          label={t("settings.account.chat.openAt")}
          control={
            <Segmented
              size="sm"
              label={t("settings.account.chat.openAt")}
              value={openAt}
              onValueChange={(v) => save({ openAt: v as ChatOpenAt })}
              options={[
                { value: "read", label: t("settings.account.chat.openRead") },
                { value: "latest", label: t("settings.account.chat.openLatest") },
              ]}
            />
          }
        />
      </div>
    </Card>
  );
}
