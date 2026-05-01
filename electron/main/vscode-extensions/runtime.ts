import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { diagnoseHostCapabilities } from './diagnostics.js'
import {
  resolveCompatibilityProfile,
  type SupportedVscodeAiExtensionId,
  type VscodeExtensionCompatProfile,
} from './profiles.js'
import type {
  VscodeExtensionInstallRecord,
  VscodeExtensionStore,
} from './store.js'

export interface VscodeExtensionHostSession {
  extensionId: SupportedVscodeAiExtensionId
  version: string
  origin: string
  viewTypes: string[]
  viewType: string | null
  viewUrl: string | null
}

interface RunningHost {
  extensionId: SupportedVscodeAiExtensionId
  version: string
  proc: ChildProcess
  origin: string
  viewTypes: string[]
}

export class VscodeExtensionHostRuntime {
  private running: RunningHost | null = null

  constructor(
    private readonly options: {
      store: VscodeExtensionStore
      hostScriptPath: string
      getWorkspacePath?: () => string | null | undefined
      profiles: () => VscodeExtensionCompatProfile[]
    },
  ) {}

  async open(
    extensionId: SupportedVscodeAiExtensionId,
    requestedViewType?: string,
  ): Promise<VscodeExtensionHostSession> {
    const active = this.options.store.getActive(extensionId)
    if (!active) throw new Error(`No active VS Code extension for ${extensionId}`)
    validateRunnable(active, this.options.profiles())

    const running = await this.ensureRunning(active)
    const profiles = this.options.profiles()
    const compatibility = resolveCompatibilityProfile(
      packageLikeFromRecord(active),
      profiles,
    )
    const viewType =
      requestedViewType?.trim() ||
      compatibility.profile?.entryViewTypes[0] ||
      running.viewTypes[0] ||
      null
    const token = randomUUID()
    return {
      extensionId,
      version: active.version,
      origin: running.origin,
      viewTypes: running.viewTypes,
      viewType,
      viewUrl: viewType
        ? `${running.origin}/view/${encodeURIComponent(viewType)}?token=${encodeURIComponent(token)}`
        : null,
    }
  }

  getState(): VscodeExtensionHostSession | null {
    if (!this.running || this.running.proc.killed) return null
    return {
      extensionId: this.running.extensionId,
      version: this.running.version,
      origin: this.running.origin,
      viewTypes: this.running.viewTypes,
      viewType: null,
      viewUrl: null,
    }
  }

  stop(): void {
    if (!this.running) return
    this.running.proc.kill()
    this.running = null
  }

  private async ensureRunning(
    active: VscodeExtensionInstallRecord,
  ): Promise<RunningHost> {
    if (
      this.running &&
      !this.running.proc.killed &&
      this.running.extensionId === active.extensionId &&
      this.running.version === active.version
    ) {
      return this.running
    }

    this.stop()
    const proc = spawnHost({
      hostScriptPath: this.options.hostScriptPath,
      extensionPath: active.extensionPath,
      workspacePath: this.options.getWorkspacePath?.() ?? undefined,
    })
    const origin = await waitForReady(proc, 20_000)
    const health = await fetchJson(`${origin}/health`, 10_000)
    if (health.ok !== true) {
      proc.kill()
      throw new Error(
        `VS Code extension host failed to activate ${active.extensionId}@${active.version}: ${health.activateError ?? 'unknown error'}`,
      )
    }
    const running: RunningHost = {
      extensionId: active.extensionId,
      version: active.version,
      proc,
      origin,
      viewTypes: Array.isArray(health.viewTypes)
        ? health.viewTypes.filter((item): item is string => typeof item === 'string')
        : [],
    }
    proc.once('exit', () => {
      if (this.running?.proc === proc) this.running = null
    })
    this.running = running
    return running
  }
}

function validateRunnable(
  active: VscodeExtensionInstallRecord,
  profiles: VscodeExtensionCompatProfile[],
): void {
  if (!active.smokeTestPassed) {
    throw new Error(`Cannot open ${active.extensionId}@${active.version}; smoke test has not passed.`)
  }
  const compatibility = resolveCompatibilityProfile(
    packageLikeFromRecord(active),
    profiles,
  )
  if (!compatibility.profile) throw new Error(compatibility.reason)
  const hostCapabilities = diagnoseHostCapabilities(compatibility.profile)
  if (!hostCapabilities.canRunWithoutMissingCapabilities) {
    throw new Error(
      `Cannot open ${active.extensionId}@${active.version}; host is missing required VS Code capabilities: ${hostCapabilities.missingCapabilities.join(', ')}.`,
    )
  }
}

function packageLikeFromRecord(active: VscodeExtensionInstallRecord) {
  const [publisher, name] = active.extensionId.split('.')
  return { publisher, name, version: active.version }
}

function spawnHost(input: {
  hostScriptPath: string
  extensionPath: string
  workspacePath?: string
}): ChildProcess {
  const args = [
    input.hostScriptPath,
    '--extensionPath',
    input.extensionPath,
    '--port',
    '0',
    '--quiet',
  ]
  if (input.workspacePath) args.push('--workspacePath', input.workspacePath)
  return spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function waitForReady(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      cleanup()
      proc.kill()
      reject(new Error(`VS Code extension host did not become ready within ${timeoutMs}ms\n${stderr}`))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      proc.stdout?.off('data', onStdout)
      proc.stderr?.off('data', onStderr)
      proc.off('exit', onExit)
      proc.off('error', onError)
    }
    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
        try {
          const msg = JSON.parse(line) as { type?: string; origin?: string }
          if (msg.type === 'READY' && typeof msg.origin === 'string') {
            cleanup()
            resolve(msg.origin)
            return
          }
        } catch {
          // keep waiting
        }
      }
    }
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    }
    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`VS Code extension host exited before READY code=${code}\n${stderr}`))
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }

    proc.stdout?.on('data', onStdout)
    proc.stderr?.on('data', onStderr)
    proc.once('exit', onExit)
    proc.once('error', onError)
  })
}

async function fetchJson(url: string, timeoutMs: number) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`VS Code extension host request failed ${res.status}: ${url}`)
  return (await res.json()) as {
    ok?: boolean
    activateError?: string | null
    viewTypes?: unknown[]
  }
}
