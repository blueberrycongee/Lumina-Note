/**
 * Shell 工具 — agent 可执行 shell 命令。
 *
 * 默认 requires_approval = true。用户端 ApprovalGate 可以配置 allowlist 免审批
 * (前缀或简易 glob,例如 "npm run *"、"git status");当命令匹配 allowlist 时,
 * 外部 gate 可以自动放行(此工具本身仍然声明需要审批,免审逻辑由 gate 负责)。
 *
 * execute 使用 child_process.spawn('sh', ['-c', cmd]),捕获 stdout/stderr/exit_code,
 * 返回 JSON 字符串。支持:
 *   - AbortSignal 终止(SIGTERM → 500ms 后 SIGKILL)
 *   - timeout_ms(默认 60_000)
 *   - cwd、env 参数
 *
 * exit_code 非 0 不抛错,作为正常 tool 结果返回(agent 自己判断);
 * 超时 / abort / spawn 失败才会抛 Error。
 */

import { spawn } from 'node:child_process'
import { z } from 'zod'

import type { Tool, ToolRegistry } from '../tool-registry.js'

export interface ShellToolOptions {
  /** 白名单(外部 gate 使用,不在本工具内自动放行) */
  allowlist?: string[]
  /** 默认超时(ms),默认 60_000 */
  timeoutMs?: number
  /** 默认工作目录 */
  cwd?: string
}

const DEFAULT_TIMEOUT_MS = 60_000

const shellSchema = z.object({
  command: z.string().min(1, 'command required'),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeout_ms: z.number().int().positive().optional(),
})

export interface ShellExecResult {
  stdout: string
  stderr: string
  exit_code: number
}

/**
 * 判断命令是否命中 allowlist。
 * 模式支持:
 *   - 精确前缀: "git status" 匹配 "git status ..."
 *   - 简易 glob: "npm run *"、"git log --*"(* 匹配任意非空字符,? 匹配单字符)
 */
export function isShellCommandAllowed(command: string, allowlist: string[] | undefined): boolean {
  if (!allowlist || allowlist.length === 0) return false
  const cmd = command.trim()
  for (const pattern of allowlist) {
    const p = pattern.trim()
    if (!p) continue
    if (!p.includes('*') && !p.includes('?')) {
      if (cmd === p || cmd.startsWith(p + ' ')) return true
      continue
    }
    const regexSrc =
      '^' +
      p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
    if (new RegExp(regexSrc).test(cmd)) return true
  }
  return false
}

export async function execShellCommand(
  command: string,
  opts: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<ShellExecResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise<ShellExecResult>((resolve, reject) => {
    let settled = false
    const mergedEnv: NodeJS.ProcessEnv | undefined = opts.env
      ? { ...process.env, ...opts.env }
      : undefined
    const child = spawn(command, {
      shell: true,
      cwd: opts.cwd,
      env: mergedEnv,
    })

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    const killTree = (signal: NodeJS.Signals) => {
      try {
        child.kill(signal)
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killTree('SIGTERM')
      setTimeout(() => killTree('SIGKILL'), 500)
      reject(new Error(`shell command timed out after ${timeoutMs}ms: ${command}`))
    }, timeoutMs)

    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      killTree('SIGTERM')
      setTimeout(() => killTree('SIGKILL'), 500)
      reject(new Error('aborted'))
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort()
        return
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err)
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      const exitCode = code ?? (signal ? 128 : -1)
      resolve({ stdout, stderr, exit_code: exitCode })
    })
  })
}

export function makeShellTool(options: ShellToolOptions = {}): Tool {
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    name: 'shell_exec',
    description:
      'Execute a shell command. Returns { stdout, stderr, exit_code } as JSON. Non-zero exit codes are returned as results (not errors); timeouts and aborts throw.',
    input_schema: z.toJSONSchema(shellSchema) as Record<string, unknown>,
    requires_approval: true,
    async execute(input, signal) {
      const parsed = shellSchema.parse(input)
      const result = await execShellCommand(parsed.command, {
        cwd: parsed.cwd ?? options.cwd,
        env: parsed.env,
        timeoutMs: parsed.timeout_ms ?? defaultTimeout,
        signal,
      })
      return JSON.stringify(result)
    },
  }
}

export function registerShellTool(registry: ToolRegistry, options: ShellToolOptions = {}): void {
  registry.register(makeShellTool(options))
}
