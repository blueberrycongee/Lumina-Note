import { describe, expect, it } from 'vitest'

import {
  execShellCommand,
  formatArgvForDisplay,
  isShellCommandAllowed,
  makeShellTool,
  registerShellTool,
} from './shell.js'
import { ToolRegistry } from '../tool-registry.js'

const neverAbort = new AbortController().signal

describe('shell', () => {
  it('returns stdout + exit_code=0 on happy path', async () => {
    const tool = makeShellTool()
    const out = JSON.parse(
      await tool.execute({ command: ['echo', 'hi'] }, neverAbort),
    ) as { stdout: string; stderr: string; exit_code: number }
    expect(out.stdout.trim()).toBe('hi')
    expect(out.exit_code).toBe(0)
  })

  it('returns non-zero exit_code without throwing', async () => {
    const tool = makeShellTool()
    const out = JSON.parse(
      await tool.execute({ command: ['sh', '-c', 'exit 7'] }, neverAbort),
    ) as { exit_code: number }
    expect(out.exit_code).toBe(7)
  })

  it('captures stderr', async () => {
    const tool = makeShellTool()
    const out = JSON.parse(
      await tool.execute({ command: ['sh', '-c', 'echo oops 1>&2'] }, neverAbort),
    ) as { stderr: string; exit_code: number }
    expect(out.stderr).toContain('oops')
    expect(out.exit_code).toBe(0)
  })

  it('throws on timeout', async () => {
    const tool = makeShellTool()
    await expect(
      tool.execute({ command: ['sleep', '5'], timeout_ms: 100 }, neverAbort),
    ).rejects.toThrow(/timed out/)
  })

  it('throws aborted when AbortSignal fires', async () => {
    const controller = new AbortController()
    const tool = makeShellTool()
    const p = tool.execute({ command: ['sleep', '5'] }, controller.signal)
    setTimeout(() => controller.abort(), 50)
    await expect(p).rejects.toThrow(/aborted/)
  })

  it('has requires_approval = true', () => {
    expect(makeShellTool().requires_approval).toBe(true)
  })

  it('passes env variables through', async () => {
    const tool = makeShellTool()
    const out = JSON.parse(
      await tool.execute(
        { command: ['sh', '-c', 'echo $FOO'], env: { FOO: 'bar' } },
        neverAbort,
      ),
    ) as { stdout: string }
    expect(out.stdout.trim()).toBe('bar')
  })

  it('does NOT interpret shell metacharacters when argv[0] is not a shell', async () => {
    const tool = makeShellTool()
    // argv is passed straight to execvp — so "&& touch pwned" is just a literal
    // argument to /bin/echo, not a second command.
    const out = JSON.parse(
      await tool.execute(
        { command: ['echo', 'safe', '&&', 'rm', '-rf', '/'] },
        neverAbort,
      ),
    ) as { stdout: string; exit_code: number }
    expect(out.exit_code).toBe(0)
    expect(out.stdout.trim()).toBe('safe && rm -rf /')
  })
})

describe('formatArgvForDisplay', () => {
  it('leaves safe tokens unquoted and quotes anything else', () => {
    expect(formatArgvForDisplay(['git', 'status'])).toBe('git status')
    expect(formatArgvForDisplay(['sh', '-c', 'echo $FOO'])).toBe('sh -c "echo $FOO"')
    expect(formatArgvForDisplay(['echo', ''])).toBe('echo ""')
  })
})

describe('isShellCommandAllowed', () => {
  it('returns false when allowlist empty or undefined', () => {
    expect(isShellCommandAllowed('anything', undefined)).toBe(false)
    expect(isShellCommandAllowed('anything', [])).toBe(false)
  })

  it('matches exact prefix (string form)', () => {
    expect(isShellCommandAllowed('git status', ['git status'])).toBe(true)
    expect(isShellCommandAllowed('git status -s', ['git status'])).toBe(true)
    expect(isShellCommandAllowed('git push', ['git status'])).toBe(false)
  })

  it('matches argv form by joining tokens', () => {
    expect(isShellCommandAllowed(['git', 'status'], ['git status'])).toBe(true)
    expect(isShellCommandAllowed(['git', 'status', '-s'], ['git status'])).toBe(true)
    expect(isShellCommandAllowed(['git', 'push'], ['git status'])).toBe(false)
  })

  it('matches glob with *', () => {
    expect(isShellCommandAllowed(['npm', 'run', 'build'], ['npm run *'])).toBe(true)
    expect(isShellCommandAllowed(['npm', 'run', 'test:watch'], ['npm run *'])).toBe(true)
    expect(isShellCommandAllowed(['npm', 'install'], ['npm run *'])).toBe(false)
  })

  it('matches glob with ?', () => {
    expect(isShellCommandAllowed(['ls'], ['l?'])).toBe(true)
    expect(isShellCommandAllowed(['lsss'], ['l?'])).toBe(false)
  })

  it('escapes regex metacharacters in prefix', () => {
    expect(isShellCommandAllowed(['echo', 'a.b'], ['echo a.b'])).toBe(true)
    expect(isShellCommandAllowed(['echo', 'axb'], ['echo a.b'])).toBe(false)
  })
})

describe('execShellCommand', () => {
  it('merges env with process.env rather than replacing', async () => {
    process.env._LUMINA_PARENT = 'from-parent'
    try {
      const res = await execShellCommand(
        ['sh', '-c', 'echo $_LUMINA_PARENT $_LUMINA_CHILD'],
        { env: { _LUMINA_CHILD: 'from-child' } },
      )
      expect(res.stdout).toContain('from-parent')
      expect(res.stdout).toContain('from-child')
    } finally {
      delete process.env._LUMINA_PARENT
    }
  })

  it('rejects empty argv', async () => {
    await expect(execShellCommand([])).rejects.toThrow(/at least one argument/)
  })
})

describe('registerShellTool', () => {
  it('registers shell in the registry', () => {
    const reg = new ToolRegistry()
    registerShellTool(reg)
    const names = reg.definitions().map((d) => d.name)
    expect(names).toContain('shell')
    expect(names).not.toContain('shell_exec')
  })
})
