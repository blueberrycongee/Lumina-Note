/**
 * Skill discovery + CRUD client for the renderer.
 *
 * Listing/reading hits opencode's /skill REST endpoint directly with the
 * cached server credentials. Writes go through Lumina's main-process IPC
 * (skill_write / skill_delete) because the renderer doesn't have raw fs
 * access — and even if it did, we want input validation main-side.
 *
 * Skill format from opencode (see opencode/src/skill/index.ts):
 *   { name, description, location, content }
 *
 * `location` is the absolute path to the SKILL.md. We use it to classify
 * the skill as "built-in" vs "vault" and to surface the source in the UI.
 */

import { invoke } from "@/lib/host";
import { getCachedServerInfo } from "./client";

export interface OpencodeSkillInfo {
  name: string;
  description: string;
  /** Absolute filesystem path to the SKILL.md. */
  location: string;
  /** Markdown body (post-frontmatter). */
  content: string;
}

export type SkillSource = "vault" | "builtin" | "external";

export interface ClassifiedSkill extends OpencodeSkillInfo {
  source: SkillSource;
  /** True if this skill can be edited/deleted (only vault skills). */
  editable: boolean;
}

const FALLBACK_AUTH_RETRIES = 30;
const FALLBACK_AUTH_DELAY_MS = 200;

async function getServerInfoOrThrow(): Promise<{
  url: string;
  username: string;
  password: string;
}> {
  // The opencode server may still be starting up the first time the
  // skill manager opens. Poll briefly to give it a chance.
  for (let i = 0; i < FALLBACK_AUTH_RETRIES; i++) {
    const info = getCachedServerInfo();
    if (info) return info;
    await new Promise((r) => setTimeout(r, FALLBACK_AUTH_DELAY_MS));
  }
  throw new Error("opencode server not ready");
}

function authHeader(info: { username: string; password: string }): string {
  return `Basic ${btoa(`${info.username}:${info.password}`)}`;
}

/**
 * Fetch all skills opencode currently knows about for the active session
 * directory. Includes Lumina's built-ins, vault skills under .claude/skills/
 * or .skills/, and global ~/.claude/skills/.
 */
export async function listOpencodeSkills(): Promise<OpencodeSkillInfo[]> {
  const info = await getServerInfoOrThrow();
  const res = await fetch(`${info.url}/skill`, {
    headers: { authorization: authHeader(info) },
  });
  if (!res.ok) {
    throw new Error(`/skill returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as OpencodeSkillInfo[] | unknown;
  return Array.isArray(json) ? (json as OpencodeSkillInfo[]) : [];
}

/**
 * Classify a raw skill record by `location`. Caller passes the active
 * vault path so we can decide which skills are "in your vault" vs bundled.
 */
export function classifySkill(
  skill: OpencodeSkillInfo,
  vaultPath: string | null,
): ClassifiedSkill {
  const loc = skill.location;
  if (vaultPath) {
    const normalized = vaultPath.replace(/[\\/]+$/, "");
    if (
      loc.startsWith(normalized + "/") ||
      loc.startsWith(normalized + "\\") ||
      loc === normalized
    ) {
      return { ...skill, source: "vault", editable: true };
    }
  }
  // Lumina's bundled skills live at <main-bundle>/skills/<name>/SKILL.md.
  // We don't know the exact prefix at runtime, but recognize the shape.
  if (
    loc.includes("/out/main/skills/") ||
    loc.includes("\\out\\main\\skills\\") ||
    loc.includes("/Resources/app.asar/") ||
    loc.includes("/skills/") /* generous fallback for packaged builds */
  ) {
    // Built-in if it's not under the vault. Plain string heuristics — the
    // worst case is a custom external skill mis-classified, which only
    // affects the UI label, not behaviour.
    return { ...skill, source: "builtin", editable: false };
  }
  return { ...skill, source: "external", editable: false };
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  [extra: string]: unknown;
}

export async function writeSkill(input: {
  vaultPath: string;
  name: string;
  frontmatter: SkillFrontmatter;
  body: string;
}): Promise<{ path: string }> {
  return invoke<{ path: string }>("skill_write", {
    vault_path: input.vaultPath,
    name: input.name,
    frontmatter: input.frontmatter,
    body: input.body,
  });
}

export async function deleteSkill(input: {
  vaultPath: string;
  name: string;
}): Promise<void> {
  await invoke("skill_delete", {
    vault_path: input.vaultPath,
    name: input.name,
  });
}
