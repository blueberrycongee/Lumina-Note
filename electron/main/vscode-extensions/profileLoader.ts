import fs from 'node:fs'
import path from 'node:path'

import {
  isSupportedVscodeAiExtensionId,
  type VscodeExtensionCompatProfile,
  type VscodeHostCapability,
} from './profiles.js'

const KNOWN_CAPABILITIES = new Set<VscodeHostCapability>([
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
      profiles.push(parseCompatProfile(filePath))
    }
  }
  return profiles
}

function parseCompatProfile(filePath: string): VscodeExtensionCompatProfile {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<VscodeExtensionCompatProfile>
  if (!raw.extensionId || !isSupportedVscodeAiExtensionId(raw.extensionId)) {
    throw new Error(`Invalid compat profile ${filePath}: unsupported extensionId`)
  }
  if (raw.channel !== 'stable' && raw.channel !== 'preview') {
    throw new Error(`Invalid compat profile ${filePath}: channel must be stable or preview`)
  }
  if (raw.hostApiVersion !== 1) {
    throw new Error(`Invalid compat profile ${filePath}: hostApiVersion must be 1`)
  }
  if (typeof raw.versionRange !== 'string' || raw.versionRange.trim().length === 0) {
    throw new Error(`Invalid compat profile ${filePath}: versionRange is required`)
  }
  const requiredCapabilities = requireStringArray(raw.requiredCapabilities, filePath, 'requiredCapabilities')
  for (const capability of requiredCapabilities) {
    if (!KNOWN_CAPABILITIES.has(capability as VscodeHostCapability)) {
      throw new Error(`Invalid compat profile ${filePath}: unknown capability ${capability}`)
    }
  }

  return {
    extensionId: raw.extensionId,
    channel: raw.channel,
    versionRange: raw.versionRange,
    hostApiVersion: 1,
    entryViewTypes: requireStringArray(raw.entryViewTypes, filePath, 'entryViewTypes'),
    requiredCapabilities: requiredCapabilities as VscodeHostCapability[],
    commandMappings: requireStringRecord(raw.commandMappings, filePath, 'commandMappings'),
    cspSourceDirectives: requireStringArrayRecord(raw.cspSourceDirectives, filePath, 'cspSourceDirectives'),
    needsTerminal: raw.needsTerminal === true,
    needsDiffViewer: raw.needsDiffViewer === true,
    needsIdeBridge: raw.needsIdeBridge === true,
    disabledFeatures: requireStringArray(raw.disabledFeatures, filePath, 'disabledFeatures'),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
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
