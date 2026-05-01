export type SupportedVscodeAiExtensionId =
  | 'anthropic.claude-code'
  | 'openai.chatgpt'

export type VscodeAiExtensionChannel = 'stable' | 'preview'

export type VscodeHostCapability =
  | 'authentication.getSession'
  | 'commands'
  | 'diagnostics-read'
  | 'diff-viewer'
  | 'env-open-external'
  | 'ide-bridge'
  | 'memento'
  | 'secret-storage'
  | 'terminal'
  | 'webview-panel'
  | 'webview-view'
  | 'window-notifications'
  | 'workspace-documents'
  | 'workspace-fs'
  | 'workspace-selection'

export interface VscodeExtensionPackageLike {
  publisher?: string
  name?: string
  version?: string
  engines?: {
    vscode?: string
  }
}

export interface VscodeExtensionCompatProfile {
  extensionId: SupportedVscodeAiExtensionId
  channel: VscodeAiExtensionChannel
  versionRange: string
  hostApiVersion: 1
  entryViewTypes: string[]
  requiredCapabilities: VscodeHostCapability[]
  commandMappings: Record<string, string>
  cspSourceDirectives: Record<string, string[]>
  needsTerminal: boolean
  needsDiffViewer: boolean
  needsIdeBridge: boolean
  disabledFeatures: string[]
  notes?: string
}

export type CompatibilityStatus =
  | 'stable'
  | 'preview'
  | 'unknown-extension'
  | 'unknown-version'
  | 'incompatible-vscode-engine'
  | 'invalid-package'

export interface CompatibilityResolution {
  extensionId: string | null
  version: string | null
  status: CompatibilityStatus
  autoUpdateEligible: boolean
  profile: VscodeExtensionCompatProfile | null
  reason: string
}

const LUMINA_VSCODE_ENGINE_VERSION = '1.98.0'

export const TARGET_VSCODE_AI_EXTENSIONS: Record<
  SupportedVscodeAiExtensionId,
  { displayName: string; marketplaceItemName: string }
> = {
  'openai.chatgpt': {
    displayName: 'Codex',
    marketplaceItemName: 'OpenAI.chatgpt',
  },
  'anthropic.claude-code': {
    displayName: 'Claude Code',
    marketplaceItemName: 'Anthropic.claude-code',
  },
}

export const BUILTIN_VSCODE_AI_COMPAT_PROFILES: VscodeExtensionCompatProfile[] = [
  {
    extensionId: 'openai.chatgpt',
    channel: 'preview',
    versionRange: '*',
    hostApiVersion: 1,
    entryViewTypes: [],
    requiredCapabilities: [
      'authentication.getSession',
      'commands',
      'diff-viewer',
      'env-open-external',
      'memento',
      'secret-storage',
      'webview-view',
      'window-notifications',
      'workspace-documents',
      'workspace-fs',
      'workspace-selection',
    ],
    commandMappings: {
      'vscode.diff': 'lumina.diff',
    },
    cspSourceDirectives: {
      'connect-src': ['self'],
      'font-src': ['self', 'data:'],
      'script-src': ['self', "'unsafe-eval'"],
    },
    needsTerminal: false,
    needsDiffViewer: true,
    needsIdeBridge: false,
    disabledFeatures: [],
    notes:
      'Preview profile for the official OpenAI ChatGPT VS Code extension. Current official builds activate on startup and do not register a sidebar view.',
  },
  {
    extensionId: 'anthropic.claude-code',
    channel: 'preview',
    versionRange: '*',
    hostApiVersion: 1,
    entryViewTypes: [],
    requiredCapabilities: [
      'authentication.getSession',
      'commands',
      'diagnostics-read',
      'diff-viewer',
      'env-open-external',
      'ide-bridge',
      'memento',
      'secret-storage',
      'terminal',
      'webview-panel',
      'webview-view',
      'window-notifications',
      'workspace-documents',
      'workspace-fs',
      'workspace-selection',
    ],
    commandMappings: {
      'vscode.diff': 'lumina.diff',
    },
    cspSourceDirectives: {
      'connect-src': ['self'],
      'font-src': ['self', 'data:'],
      'script-src': ['self', "'unsafe-eval'"],
    },
    needsTerminal: true,
    needsDiffViewer: true,
    needsIdeBridge: true,
    disabledFeatures: [],
    notes:
      'Preview profile for the official Claude Code VS Code extension. It is intentionally not stable because Claude depends on terminal and IDE bridge behavior.',
  },
]

export function normalizeVscodeExtensionId(input: string): string {
  return input.trim().toLowerCase()
}

export function extensionIdFromPackage(
  pkg: VscodeExtensionPackageLike,
): string | null {
  const publisher = pkg.publisher?.trim()
  const name = pkg.name?.trim()
  if (!publisher || !name) return null
  return normalizeVscodeExtensionId(`${publisher}.${name}`)
}

export function isSupportedVscodeAiExtensionId(
  extensionId: string,
): extensionId is SupportedVscodeAiExtensionId {
  return normalizeVscodeExtensionId(extensionId) in TARGET_VSCODE_AI_EXTENSIONS
}

export function resolveCompatibilityProfile(
  pkg: VscodeExtensionPackageLike,
  profiles: VscodeExtensionCompatProfile[] = BUILTIN_VSCODE_AI_COMPAT_PROFILES,
): CompatibilityResolution {
  const extensionId = extensionIdFromPackage(pkg)
  const version = pkg.version?.trim() || null
  if (!extensionId || !version) {
    return {
      extensionId,
      version,
      status: 'invalid-package',
      autoUpdateEligible: false,
      profile: null,
      reason: 'Extension package is missing publisher/name/version metadata.',
    }
  }

  if (!isSupportedVscodeAiExtensionId(extensionId)) {
    return {
      extensionId,
      version,
      status: 'unknown-extension',
      autoUpdateEligible: false,
      profile: null,
      reason: `Unsupported VS Code extension: ${extensionId}.`,
    }
  }

  const vscodeEngine = pkg.engines?.vscode?.trim()
  if (vscodeEngine && !satisfiesVersionRange(LUMINA_VSCODE_ENGINE_VERSION, vscodeEngine)) {
    return {
      extensionId,
      version,
      status: 'incompatible-vscode-engine',
      autoUpdateEligible: false,
      profile: null,
      reason: `Extension requires VS Code ${vscodeEngine}; Lumina host currently targets ${LUMINA_VSCODE_ENGINE_VERSION}.`,
    }
  }

  const candidates = profiles
    .filter((profile) => profile.extensionId === extensionId)
    .filter((profile) => satisfiesVersionRange(version, profile.versionRange))
    .sort((a, b) => channelRank(b.channel) - channelRank(a.channel))

  const profile = candidates[0] ?? null
  if (!profile) {
    return {
      extensionId,
      version,
      status: 'unknown-version',
      autoUpdateEligible: false,
      profile: null,
      reason: `No compatibility profile covers ${extensionId}@${version}.`,
    }
  }

  return {
    extensionId,
    version,
    status: profile.channel,
    autoUpdateEligible: profile.channel === 'stable',
    profile,
    reason:
      profile.channel === 'stable'
        ? `Stable compatibility profile covers ${extensionId}@${version}.`
        : `Only preview compatibility is available for ${extensionId}@${version}; smoke test and manual opt-in are required.`,
  }
}

function channelRank(channel: VscodeAiExtensionChannel): number {
  return channel === 'stable' ? 2 : 1
}

function satisfiesVersionRange(version: string, range: string): boolean {
  const cleanRange = range.trim()
  if (cleanRange === '' || cleanRange === '*') return true
  return cleanRange
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => satisfiesConjunctiveRange(version, part))
}

function satisfiesConjunctiveRange(version: string, range: string): boolean {
  const comparators = range.split(/\s+/).filter(Boolean)
  if (comparators.length === 0) return true
  return comparators.every((comparator) => satisfiesComparator(version, comparator))
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const wildcard = comparator.match(/^(\d+)\.x$/i)
  if (wildcard) {
    return parseVersion(version)?.[0] === Number(wildcard[1])
  }

  const match = comparator.match(/^(>=|<=|>|<|\^|~)?(.+)$/)
  if (!match) return false
  const op = match[1] ?? '='
  const target = parseVersion(match[2])
  const current = parseVersion(version)
  if (!target || !current) return false

  if (op === '^') {
    const upper: [number, number, number] =
      target[0] > 0
        ? [target[0] + 1, 0, 0]
        : target[1] > 0
          ? [0, target[1] + 1, 0]
          : [0, 0, target[2] + 1]
    return compareVersions(current, target) >= 0 && compareVersions(current, upper) < 0
  }

  if (op === '~') {
    const upper: [number, number, number] = [target[0], target[1] + 1, 0]
    return compareVersions(current, target) >= 0 && compareVersions(current, upper) < 0
  }

  const comparison = compareVersions(current, target)
  switch (op) {
    case '>':
      return comparison > 0
    case '>=':
      return comparison >= 0
    case '<':
      return comparison < 0
    case '<=':
      return comparison <= 0
    default:
      return comparison === 0
  }
}

function parseVersion(value: string): [number, number, number] | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null
  return [
    Number(match[1]),
    Number(match[2] ?? 0),
    Number(match[3] ?? 0),
  ]
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i += 1) {
    const delta = left[i] - right[i]
    if (delta !== 0) return delta
  }
  return 0
}
