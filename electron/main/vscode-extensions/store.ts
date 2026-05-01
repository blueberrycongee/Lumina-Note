import fs from 'node:fs'
import path from 'node:path'

import type {
  CompatibilityStatus,
  SupportedVscodeAiExtensionId,
} from './profiles.js'

export type VscodeExtensionInstallSource =
  | 'manual-vsix'
  | 'marketplace'
  | 'open-vsx'
  | 'github-release'

export interface VscodeExtensionCompatibilitySnapshot {
  status: CompatibilityStatus
  reason: string
  autoUpdateEligible: boolean
  profileVersionRange: string | null
}

export interface VscodeExtensionInstallRecord {
  extensionId: SupportedVscodeAiExtensionId
  version: string
  extensionPath: string
  source: VscodeExtensionInstallSource
  installedAt: string
  packageSha256?: string
  compatibility: VscodeExtensionCompatibilitySnapshot
}

export interface VscodeExtensionState {
  schemaVersion: 1
  activeById: Partial<Record<SupportedVscodeAiExtensionId, string>>
  previousById: Partial<Record<SupportedVscodeAiExtensionId, string>>
  installed: Partial<
    Record<
      SupportedVscodeAiExtensionId,
      Record<string, VscodeExtensionInstallRecord>
    >
  >
}

const DEFAULT_STATE: VscodeExtensionState = {
  schemaVersion: 1,
  activeById: {},
  previousById: {},
  installed: {},
}

export class VscodeExtensionStore {
  private readonly filePath: string

  constructor(options: { baseDir: string; fileName?: string }) {
    this.filePath = path.join(
      options.baseDir,
      options.fileName ?? 'lumina-vscode-extensions.json',
    )
  }

  getState(): VscodeExtensionState {
    return cloneState(this.readState())
  }

  listInstalled(
    extensionId: SupportedVscodeAiExtensionId,
  ): VscodeExtensionInstallRecord[] {
    const state = this.readState()
    return Object.values(state.installed[extensionId] ?? {}).sort((a, b) =>
      b.installedAt.localeCompare(a.installedAt),
    )
  }

  getActive(
    extensionId: SupportedVscodeAiExtensionId,
  ): VscodeExtensionInstallRecord | null {
    const state = this.readState()
    const version = state.activeById[extensionId]
    if (!version) return null
    return state.installed[extensionId]?.[version] ?? null
  }

  recordInstall(record: VscodeExtensionInstallRecord): void {
    const state = this.readState()
    state.installed[record.extensionId] = {
      ...(state.installed[record.extensionId] ?? {}),
      [record.version]: record,
    }
    this.writeState(state)
  }

  activate(extensionId: SupportedVscodeAiExtensionId, version: string): void {
    const state = this.readState()
    const record = state.installed[extensionId]?.[version]
    if (!record) {
      throw new Error(`Cannot activate missing extension ${extensionId}@${version}`)
    }

    const current = state.activeById[extensionId]
    if (current && current !== version) {
      state.previousById[extensionId] = current
    }
    state.activeById[extensionId] = version
    this.writeState(state)
  }

  rollback(extensionId: SupportedVscodeAiExtensionId): VscodeExtensionInstallRecord {
    const state = this.readState()
    const previous = state.previousById[extensionId]
    if (!previous) {
      throw new Error(`No previous extension version recorded for ${extensionId}`)
    }
    const previousRecord = state.installed[extensionId]?.[previous]
    if (!previousRecord) {
      throw new Error(`Previous extension version missing: ${extensionId}@${previous}`)
    }

    const current = state.activeById[extensionId]
    state.activeById[extensionId] = previous
    if (current && current !== previous) {
      state.previousById[extensionId] = current
    } else {
      delete state.previousById[extensionId]
    }
    this.writeState(state)
    return previousRecord
  }

  private readState(): VscodeExtensionState {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<VscodeExtensionState>
      if (parsed.schemaVersion !== 1) return cloneState(DEFAULT_STATE)
      return {
        schemaVersion: 1,
        activeById: parsed.activeById ?? {},
        previousById: parsed.previousById ?? {},
        installed: parsed.installed ?? {},
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return cloneState(DEFAULT_STATE)
      }
      throw err
    }
  }

  private writeState(state: VscodeExtensionState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }
}

function cloneState(state: VscodeExtensionState): VscodeExtensionState {
  return JSON.parse(JSON.stringify(state)) as VscodeExtensionState
}
