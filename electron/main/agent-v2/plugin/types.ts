/**
 * Local copies of opencode's plugin/tool types and the `tool()` helper.
 *
 * Why not import @opencode-ai/plugin directly: it's a workspace package
 * within opencode's monorepo and Lumina's package.json doesn't depend on it.
 * Pulling it in would couple our build to opencode's internal versioning.
 *
 * The runtime contract is tiny — `tool()` is identity, types are interfaces —
 * so duplicating it locally has no maintenance cost. The shapes here MUST
 * match thirdparty/opencode/packages/plugin/src/{index,tool}.ts exactly,
 * because opencode reflects on the returned objects at load time.
 */

import { z } from 'zod'

export interface AskInput {
  permission: string
  patterns: string[]
  always: string[]
  metadata: Record<string, unknown>
}

// Effect.Effect<void> in opencode; we model it as a Promise here because
// our plugin only ever needs to call it, not unwrap the Effect type.
type EffectPromise<T> = Promise<T> | unknown

export interface ToolContext {
  sessionID: string
  messageID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): void
  ask(input: AskInput): EffectPromise<void>
}

export type ToolResult =
  | string
  | { output: string; metadata?: Record<string, unknown> }

export interface ToolDefinition<Args extends z.ZodRawShape = z.ZodRawShape> {
  description: string
  args: Args
  execute(
    args: z.infer<z.ZodObject<Args>>,
    context: ToolContext,
  ): Promise<ToolResult>
}

interface ToolHelper {
  <Args extends z.ZodRawShape>(input: ToolDefinition<Args>): ToolDefinition<Args>
  schema: typeof z
}

// `tool()` is identity — opencode just stores the object and reflects on
// `args`, `description`, `execute` later.
export const tool: ToolHelper = Object.assign(
  function tool<Args extends z.ZodRawShape>(
    input: ToolDefinition<Args>,
  ): ToolDefinition<Args> {
    return input
  },
  { schema: z },
) as ToolHelper

export interface Hooks {
  tool?: Record<string, ToolDefinition>
  // Other opencode hooks exist but we don't use them yet. Add as needed.
}

export type PluginInput = {
  // We never use these fields in our plugin, so leaving as unknown keeps
  // the plugin decoupled from opencode's internal types.
  client?: unknown
  project?: unknown
  directory?: string
  worktree?: string
  serverUrl?: URL
}

export type Plugin = (
  input: PluginInput,
  options?: Record<string, unknown>,
) => Promise<Hooks>

/**
 * Default-export shape opencode requires for path-based plugins
 * (see thirdparty/opencode/packages/opencode/src/plugin/shared.ts:resolvePluginId).
 */
export interface PluginModule {
  id: string
  server: Plugin
}
