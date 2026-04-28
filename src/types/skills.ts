/**
 * Selected-skill is the lightweight shape carried by the Skill chip UI
 * above the chat input. opencode handles the full skill protocol
 * (discovery, listing, the `skill` tool, permission gating); Lumina's
 * renderer only tracks which ones the user has explicitly tagged.
 *
 * For the full opencode skill record (with location / content / source
 * classification), see src/services/opencode/skills.ts.
 */
export interface SelectedSkill {
  name: string;
  description?: string;
  /** SKILL.md body — preserved so consumers (e.g. ChatInput slash menu) can
   *  drop the playbook directly into the chat input when the skill is
   *  invoked via slash. */
  prompt: string;
}
