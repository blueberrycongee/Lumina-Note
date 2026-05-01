import type {
  VscodeExtensionCompatProfile,
  VscodeHostCapability,
} from './profiles.js'

export const CURRENT_VSCODE_HOST_CAPABILITIES: ReadonlySet<VscodeHostCapability> =
  new Set<VscodeHostCapability>([
    'authentication.getSession',
    'commands',
    'diagnostics-read',
    'diff-viewer',
    'env-metadata',
    'env-open-external',
    'extension-environment',
    'ide-bridge',
    'memento',
    'notebook-output',
    'secret-storage',
    'terminal',
    'webview-panel',
    'webview-panel-serializer',
    'webview-view',
    'window-notifications',
    'workspace-content-provider',
    'workspace-custom-fs',
    'workspace-documents',
    'workspace-file-watchers',
    'workspace-fs',
    'workspace-selection',
  ])

export interface VscodeHostCapabilityDiagnostic {
  canRunWithoutMissingCapabilities: boolean
  missingCapabilities: VscodeHostCapability[]
  implementedCapabilities: VscodeHostCapability[]
}

export function diagnoseHostCapabilities(
  profile: VscodeExtensionCompatProfile,
  implemented: ReadonlySet<VscodeHostCapability> = CURRENT_VSCODE_HOST_CAPABILITIES,
): VscodeHostCapabilityDiagnostic {
  const missingCapabilities = profile.requiredCapabilities.filter(
    (capability) => !implemented.has(capability),
  )

  return {
    canRunWithoutMissingCapabilities: missingCapabilities.length === 0,
    missingCapabilities,
    implementedCapabilities: profile.requiredCapabilities.filter((capability) =>
      implemented.has(capability),
    ),
  }
}
