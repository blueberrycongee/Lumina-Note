import { version } from '../../../../package.json'

/** The subset of opencode configuration used by Lumina's search defaults. */
export interface SearchConfig {
  mcp?: Record<string, unknown>
  tools?: Record<string, boolean>
  permission?: string | Record<string, unknown>
  agent?: Record<string, {
    tools?: Record<string, boolean>
    permission?: string | Record<string, unknown>
  }>
}

// Keep permission-name matching aligned with the release-pinned opencode
// util/wildcard.ts, including its optional trailing " *" convention.
function matches(pattern: string, name: string): boolean {
  name = name.replace(/\\/g, '/')
  pattern = pattern.replace(/\\/g, '/')
  let escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*').replace(/\?/g, '.')
  if (escaped.endsWith(' .*')) escaped = escaped.slice(0, -3) + '( .*)?'
  const flags = process.platform === 'win32' ? 'si' : 's'
  return new RegExp(`^${escaped}$`, flags).test(name)
}

/**
 * Called with opencode's merged configuration, before MCP initialization.
 * An existing MCP map or network-tool policy is an explicit user choice.
 */
export function configureSearchMcp(config: SearchConfig): void {
  const permission = config.permission
  if (
    config.mcp !== undefined ||
    ['OPENCODE_ENABLE_EXA', 'OPENCODE_EXPERIMENTAL', 'OPENCODE_EXPERIMENTAL_EXA']
      .some((name) => ['1', 'true'].includes(process.env[name] ?? '')) ||
    process.env.EXA_API_KEY ||
    process.env.PARALLEL_API_KEY ||
    config.tools?.websearch !== undefined ||
    config.tools?.webfetch !== undefined ||
    permission === 'deny' ||
    (typeof permission === 'object' && (
      permission['*'] === 'deny' ||
      Object.keys(permission).some((key) => key !== '*' &&
        (matches(key, 'websearch') || matches(key, 'webfetch')))
    ))
  ) return

  // Use the normal approval flow for the new tools. Explicit global allow
  // (including Lumina's auto-approve setting) remains authoritative.
  if (permission === undefined) config.permission = { 'lumina_parallel_*': 'ask' }
  else if (typeof permission === 'object') {
    config.permission = { 'lumina_parallel_*': 'ask', ...permission }
  }

  config.mcp = {
    lumina_parallel: {
      type: 'remote',
      url: 'https://search.parallel.ai/mcp',
      oauth: false,
      timeout: 30_000,
      headers: { 'User-Agent': `Lumina-Note/${version}` },
    },
  }

  // MCP tools have their own permission names. Carry over agent-specific
  // network restrictions so background agents cannot bypass them.
  for (const agent of Object.values(config.agent ?? {})) {
    if (typeof agent.permission === 'string') continue
    // Match ConfigAgent.normalize: deprecated tools are defaults; explicit
    // permissions win. The hook normally receives this already normalized.
    const original: Record<string, unknown> = {
      ...Object.fromEntries(Object.entries(agent.tools ?? {})
        .map(([name, enabled]) => [name, enabled ? 'allow' : 'deny'])),
      ...agent.permission,
    }
    const policy = { ...agent.permission }
    // Match Permission.fromConfig: wildcard tool rules precede exact rules.
    const entries = Object.entries(original).sort(([a], [b]) =>
      Number(b.includes('*')) - Number(a.includes('*')))
    for (const [builtin, mcp] of [
      ['websearch', 'lumina_parallel_web_search'],
      ['webfetch', 'lumina_parallel_web_fetch'],
    ]) {
      if (Object.keys(original).some((key) => key !== '*' && matches(key, mcp) && !matches(key, builtin))) continue
      for (const [pattern, action] of entries) {
        if (pattern === '*' || !matches(pattern, builtin)) continue
        // URL/query-scoped rules cannot be applied to MCP's '*' resource.
        // Keep those restrictions by denying the corresponding default tool.
        policy[mcp] = typeof action === 'string' ? action : 'deny'
      }
    }
    agent.permission = policy
  }
}
