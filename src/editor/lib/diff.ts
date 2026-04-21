/**
 * Compute the minimal ChangeSpec between two strings.
 *
 * Finds the longest common prefix and suffix, then returns a single
 * `{ from, to, insert }` that describes the changed region.
 *
 * Returns `null` when the strings are identical (no change needed).
 */
export function computeStringDiff(
  oldStr: string,
  newStr: string,
): { from: number; to: number; insert: string } | null {
  if (oldStr === newStr) {
    return null;
  }

  const oldLen = oldStr.length;
  const newLen = newStr.length;

  // Find common prefix length
  let prefix = 0;
  const maxPrefix = Math.min(oldLen, newLen);
  while (prefix < maxPrefix && oldStr[prefix] === newStr[prefix]) {
    prefix++;
  }

  // If one string is a prefix of the other, the change is a pure insert/delete
  // at the end of the common prefix.
  if (prefix === oldLen) {
    return { from: prefix, to: prefix, insert: newStr.slice(prefix) };
  }
  if (prefix === newLen) {
    return { from: prefix, to: oldLen, insert: "" };
  }

  // Find common suffix length (relative to the end of each string)
  let suffix = 0;
  const maxSuffix = Math.min(oldLen - prefix, newLen - prefix);
  while (
    suffix < maxSuffix &&
    oldStr[oldLen - 1 - suffix] === newStr[newLen - 1 - suffix]
  ) {
    suffix++;
  }

  const from = prefix;
  const to = oldLen - suffix;
  const insert = newStr.slice(prefix, newLen - suffix);

  return { from, to, insert };
}
