export interface CalloutTypeConfig {
  icon: string;
  color: string;
}

export const CALLOUT_CONFIG: Record<string, CalloutTypeConfig> = {
  note:     { icon: '📝', color: 'blue' },
  abstract: { icon: '📄', color: 'blue' },
  summary:  { icon: '📄', color: 'blue' },
  info:     { icon: 'ℹ️', color: 'blue' },
  tip:      { icon: '💡', color: 'green' },
  hint:     { icon: '💡', color: 'green' },
  success:  { icon: '✅', color: 'green' },
  check:    { icon: '✅', color: 'green' },
  done:     { icon: '✅', color: 'green' },
  question: { icon: '❓', color: 'yellow' },
  warning:  { icon: '⚠️', color: 'yellow' },
  caution:  { icon: '⚠️', color: 'yellow' },
  danger:   { icon: '🔴', color: 'red' },
  failure:  { icon: '❌', color: 'red' },
  fail:     { icon: '❌', color: 'red' },
  missing:  { icon: '❌', color: 'red' },
  bug:      { icon: '🐛', color: 'red' },
  example:  { icon: '📋', color: 'purple' },
  quote:    { icon: '💬', color: 'gray' },
  cite:     { icon: '💬', color: 'gray' },
};

const EMOJI_REGEX = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;

export function isEmoji(str: string): boolean {
  return EMOJI_REGEX.test(str);
}

export function resolveCalloutType(rawType: string): { icon: string; color: string; label: string } {
  const type = rawType.toLowerCase();
  const emojiType = isEmoji(rawType);
  const config = emojiType
    ? { icon: rawType, color: 'blue' }
    : (CALLOUT_CONFIG[type] || { icon: '📝', color: 'gray' });
  const label = emojiType ? '' : type.charAt(0).toUpperCase() + type.slice(1);
  return { ...config, label };
}

export function parseFoldModifier(header: string): 'open' | 'closed' {
  const match = header.match(/^>\s*\[![^\]]+\]\s*([+-])/);
  if (match) return match[1] === '-' ? 'closed' : 'open';
  return 'open';
}

export function matchCalloutHeader(line: string): { rawType: string; title: string; foldable: boolean; defaultFolded: boolean } | null {
  const m = line.match(/^>\s*\[!([^\]]+)\]\s*([+-])?\s*(.*)?$/);
  if (!m) return null;
  const rawType = m[1].trim();
  const modifier = m[2] as '+' | '-' | undefined;
  const titleText = (m[3] || '').trim();
  const resolved = resolveCalloutType(rawType);
  return {
    rawType,
    title: titleText || resolved.label,
    foldable: modifier !== undefined,
    defaultFolded: modifier === '-',
  };
}
