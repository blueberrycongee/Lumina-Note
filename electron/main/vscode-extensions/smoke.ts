import { spawn, type ChildProcess } from 'node:child_process'

export interface VscodeHostSmokeTestInput {
  hostScriptPath: string
  extensionPath: string
  workspacePath?: string
  expectedViewTypes?: string[]
  timeoutMs?: number
  nodePath?: string
}

export interface VscodeHostSmokeTestResult {
  ok: boolean
  origin: string
  health: {
    ok?: boolean
    activateError?: string | null
    viewTypes?: string[]
    [key: string]: unknown
  }
}

export async function runVscodeHostSmokeTest(
  input: VscodeHostSmokeTestInput,
): Promise<VscodeHostSmokeTestResult> {
  const timeoutMs = input.timeoutMs ?? 10_000
  const proc = spawnHost(input)
  try {
    const origin = await waitForReady(proc, timeoutMs)
    const health = await fetchJson(`${origin}/health`, timeoutMs)
    const missingViewTypes = (input.expectedViewTypes ?? []).filter(
      (viewType) => !health.viewTypes?.includes(viewType),
    )
    if (health.ok !== true || missingViewTypes.length > 0) {
      return {
        ok: false,
        origin,
        health: {
          ...health,
          missingViewTypes,
        },
      }
    }
    return { ok: true, origin, health }
  } finally {
    proc.kill()
  }
}

function spawnHost(input: VscodeHostSmokeTestInput): ChildProcess {
  const args = [
    input.hostScriptPath,
    '--extensionPath',
    input.extensionPath,
    '--port',
    '0',
    '--quiet',
  ]
  if (input.workspacePath) args.push('--workspacePath', input.workspacePath)
  return spawn(input.nodePath ?? process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function waitForReady(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`codex-vscode-host did not become ready within ${timeoutMs}ms\n${stderr}`))
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
      reject(new Error(`codex-vscode-host exited before READY code=${code}\n${stderr}`))
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
  if (!res.ok) throw new Error(`Smoke test request failed ${res.status}: ${url}`)
  return (await res.json()) as VscodeHostSmokeTestResult['health']
}
