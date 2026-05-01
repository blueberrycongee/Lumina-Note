import fs from 'node:fs'
import path from 'node:path'

import {
  isSupportedVscodeAiExtensionId,
  type VscodeExtensionCompatProfile,
  type VscodeHostCapability,
} from './profiles.js'

const KNOWN_CAPABILITIES = new Set<VscodeHostCapability>([
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

export function loadExternalCompatProfiles(root: string): VscodeExtensionCompatProfile[] {
  if (!fs.existsSync(root)) return []
  const profiles: VscodeExtensionCompatProfile[] = []
  for (const extensionDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!extensionDir.isDirectory()) continue
    const dir = path.join(root, extensionDir.name)
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const filePath = path.join(dir, entry.name)
      profiles.push(parseCompatProfileFile(filePath))
    }
  }
  return profiles
}

function parseCompatProfileFile(filePath: string): VscodeExtensionCompatProfile {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<VscodeExtensionCompatProfile>
  return parseCompatProfileObject(raw, filePath)
}

export function parseCompatProfileObject(
  raw: unknown,
  context: string,
): VscodeExtensionCompatProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid compat profile ${context}: expected object`)
  }
  const profile = raw as Partial<VscodeExtensionCompatProfile>
  if (!profile.extensionId || !isSupportedVscodeAiExtensionId(profile.extensionId)) {
    throw new Error(`Invalid compat profile ${context}: unsupported extensionId`)
  }
  if (profile.channel !== 'stable' && profile.channel !== 'preview') {
    throw new Error(`Invalid compat profile ${context}: channel must be stable or preview`)
  }
  if (profile.hostApiVersion !== 1) {
    throw new Error(`Invalid compat profile ${context}: hostApiVersion must be 1`)
  }
  if (typeof profile.versionRange !== 'string' || profile.versionRange.trim().length === 0) {
    throw new Error(`Invalid compat profile ${context}: versionRange is required`)
  }
  const requiredCapabilities = requireStringArray(profile.requiredCapabilities, context, 'requiredCapabilities')
  for (const capability of requiredCapabilities) {
    if (!KNOWN_CAPABILITIES.has(capability as VscodeHostCapability)) {
      throw new Error(`Invalid compat profile ${context}: unknown capability ${capability}`)
    }
  }

  return {
    extensionId: profile.extensionId,
    channel: profile.channel,
    versionRange: profile.versionRange,
    hostApiVersion: 1,
    entryViewTypes: requireStringArray(profile.entryViewTypes, context, 'entryViewTypes'),
    requiredCapabilities: requiredCapabilities as VscodeHostCapability[],
    commandMappings: requireStringRecord(profile.commandMappings, context, 'commandMappings'),
    cspSourceDirectives: requireStringArrayRecord(profile.cspSourceDirectives, context, 'cspSourceDirectives'),
    needsTerminal: profile.needsTerminal === true,
    needsDiffViewer: profile.needsDiffViewer === true,
    needsIdeBridge: profile.needsIdeBridge === true,
    disabledFeatures: requireStringArray(profile.disabledFeatures, context, 'disabledFeatures'),
    notes: typeof profile.notes === 'string' ? profile.notes : undefined,
  }
}

function requireStringArray(value: unknown, filePath: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid compat profile ${filePath}: ${field} must be a string array`)
  }
  return value
}

function requireStringRecord(value: unknown, filePath: string, field: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid compat profile ${filePath}: ${field} must be an object`)
  }
  const record = value as Record<string, unknown>
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== 'string') {
      throw new Error(`Invalid compat profile ${filePath}: ${field}.${key} must be a string`)
    }
  }
  return record as Record<string, string>
}

function requireStringArrayRecord(
  value: unknown,
  filePath: string,
  field: string,
): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid compat profile ${filePath}: ${field} must be an object`)
  }
  const record = value as Record<string, unknown>
  for (const [key, item] of Object.entries(record)) {
    if (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Invalid compat profile ${filePath}: ${field}.${key} must be a string array`)
    }
  }
  return record as Record<string, string[]>
}
