/**
 * Shell 工具 — agent 执行 shell 命令。
 *
 * 工具形状对齐 OpenAI Codex `shell` 工具:
 *   - `command` 是 argv 数组(`string[]`),直接交给 `child_process.spawn(argv[0], argv.slice(1))`,
 *     不经 `/bin/sh -c`,从协议层面规避 shell injection。
 *   - 如果真要调用 shell(管道/重定向/变量),模型应显式写出 `["bash", "-lc", "<script>"]`
 *     或 Windows 上 `["powershell.exe", "-Command", "<script>"]`。
 *   - `workdir`(对齐 Codex)+ `timeout_ms`(对齐 Codex)+ 额外 `env`(方便测试注入环境变量)。
 *
 * 默认 requires_approval = true。用户端 ApprovalGate 可以配置 allowlist 免审批
 * (前缀或简易 glob,例如 "npm run *"、"git status");当 argv 拼成的命令行匹配
 * allowlist 时,外部 gate 可以自动放行(此工具本身仍然声明需要审批)。
 *
 * execute 返回 `{ stdout, stderr, exit_code }` 的 JSON 字符串。
 *   - AbortSignal 终止(SIGTERM → 500ms 后 SIGKILL)
 *   - timeout_ms(默认 60_000)
 *   - exit_code 非 0 不抛错,作为正常 tool 结果返回(agent 自己判断)
 *   - 超时 / abort / spawn 失败才会抛 Error
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
  command: z
    .array(z.string())
    .min(1, 'command must contain at least one argument (the program name)'),
  workdir: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()).optional(),
})

const SHELL_DESCRIPTION = `Runs a shell command and returns its output.
- The arguments to \`shell\` will be passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].
- Always set the \`workdir\` param when using the shell function. Do not use \`cd\` unless absolutely necessary.
Returns { stdout, stderr, exit_code } as JSON. Non-zero exit codes are returned as results (not errors); timeouts and aborts throw.`

export interface ShellExecResult {
  stdout: string
  stderr: string
  exit_code: number
}

/** 把 argv 拼成一条可读命令行,供 allowlist 匹配和错误消息使用。 */
export function formatArgvForDisplay(argv: readonly string[]): string {
  return argv
    .map((arg) => {
      if (arg === '') return '""'
      if (/^[A-Za-z0-9_\-./=:,@+]+$/.test(arg)) return arg
      return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    })
    .join(' ')
}

/**
 * 判断命令是否命中 allowlist。
 * 模式支持(匹配对象是 argv 拼接后的命令行字符串):
 *   - 精确前缀: "git status" 匹配 "git status ..."
 *   - 简易 glob: "npm run *"、"git log --*"(* 匹配任意非空字符,? 匹配单字符)
 */
export function isShellCommandAllowed(
  command: string | readonly string[],
  allowlist: string[] | undefined,
): boolean {
  if (!allowlist || allowlist.length === 0) return false
  const cmd = Array.isArray(command) ? formatArgvForDisplay(command) : String(command).trim()
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
  argv: readonly string[],
  opts: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
    signal?: AbortSignal
  } = {},
): Promise<ShellExecResult> {
  if (argv.length === 0) {
    throw new Error('shell: command must contain at least one argument')
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const display = formatArgvForDisplay(argv)
  return new Promise<ShellExecResult>((resolve, reject) => {
    let settled = false
    const mergedEnv: NodeJS.ProcessEnv | undefined = opts.env
      ? { ...process.env, ...opts.env }
      : undefined
    const child = spawn(argv[0], argv.slice(1), {
      shell: false,
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

    const killTree = (sig: NodeJS.Signals) => {
      try {
        child.kill(sig)
      } catch {
        // ignore
      }
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      killTree('SIGTERM')
      setTimeout(() => killTree('SIGKILL'), 500)
      reject(new Error(`shell command timed out after ${timeoutMs}ms: ${display}`))
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
    name: 'shell',
    description: SHELL_DESCRIPTION,
    input_schema: z.toJSONSchema(shellSchema) as Record<string, unknown>,
    requires_approval: true,
    async execute(input, signal) {
      const parsed = shellSchema.parse(input)
      const result = await execShellCommand(parsed.command, {
        cwd: parsed.workdir ?? options.cwd,
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
