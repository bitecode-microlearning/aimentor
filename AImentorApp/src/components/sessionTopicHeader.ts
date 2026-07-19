const ORDINAL_WORDS = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
] as const;

export interface SessionTopicHeaderInput {
  current?: number | null;
  total?: number | null;
  title?: string | null;
  status: string;
}

export interface SessionTopicHeaderView {
  primary: string;
  secondary: string | null;
  accessibleLabel: string;
}

function spokenStatus(status: string): string {
  return status.trim().replace(/(?:\.\.\.|…)+$/, "");
}

export function formatSessionTopicHeader(input: SessionTopicHeaderInput): SessionTopicHeaderView {
  const status = input.status.trim();
  const total = Number(input.total);

  if (!Number.isInteger(total) || total < 1) {
    return {
      primary: status,
      secondary: null,
      accessibleLabel: spokenStatus(status) ? `${spokenStatus(status)}.` : "Mentor session status.",
    };
  }

  const requestedCurrent = Number(input.current);
  const normalizedCurrent = Number.isInteger(requestedCurrent) ? requestedCurrent : 1;
  const current = Math.min(total, Math.max(1, normalizedCurrent));
  const title = input.title?.trim() || "Current topic";
  const topicWord = total === 1 ? "topic" : "topics";
  const progress = current <= 10
    ? `${ORDINAL_WORDS[current]} of ${total} ${topicWord}`
    : `Topic ${current} of ${total}`;
  const secondary = status ? `${progress} · ${status}` : progress;
  const accessibleStatus = spokenStatus(status);

  return {
    primary: title,
    secondary,
    accessibleLabel: `Topic ${current} of ${total}: ${title}.${accessibleStatus ? ` ${accessibleStatus}.` : ""}`,
  };
}
