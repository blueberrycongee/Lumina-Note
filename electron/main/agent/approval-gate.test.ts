import { describe, expect, it, vi } from 'vitest'

import {
  AutoApprovalGate,
  IpcApprovalGate,
} from './approval-gate.js'
import type { ToolCall } from './types.js'

function mkCall(id: string, name = 'echo'): ToolCall {
  return { id, name, input: {} }
}

describe('AutoApprovalGate', () => {
  it('approves everything', async () => {
    const gate = new AutoApprovalGate()
    await expect(gate.request(mkCall('t1'))).resolves.toEqual({
      decision: 'approve',
    })
  })
})

describe('IpcApprovalGate', () => {
  it('resolves a pending request when the user approves', async () => {
    const gate = new IpcApprovalGate()
    const pending = gate.request(mkCall('t1'))
    gate.resolve('t1', 'approve')
    await expect(pending).resolves.toEqual({
      decision: 'approve',
      reason: undefined,
    })
  })

  it('resolves with reject + reason when the user rejects', async () => {
    const gate = new IpcApprovalGate()
    const pending = gate.request(mkCall('t2'))
    gate.resolve('t2', 'reject', 'not safe')
    await expect(pending).resolves.toEqual({
      decision: 'reject',
      reason: 'not safe',
    })
  })

  it('auto-approves when tool name is in allowlist', async () => {
    const gate = new IpcApprovalGate({ allowlist: ['echo'] })
    const result = await gate.request(mkCall('t3', 'echo'))
    expect(result.decision).toBe('approve')
    expect(result.reason).toContain('allowlist')
    // allowlist path should not leave anything pending
    expect(gate.listPending()).toEqual([])
  })

  it('supports allowlist as a predicate function', async () => {
    const gate = new IpcApprovalGate({
      allowlist: (tc) => tc.name.startsWith('read_'),
    })
    await expect(gate.request(mkCall('t4', 'read_file'))).resolves.toEqual({
      decision: 'approve',
      reason: 'auto:allowlist',
    })
    const pending = gate.request(mkCall('t5', 'write_file'))
    gate.resolve('t5', 'approve')
    await expect(pending).resolves.toEqual({
      decision: 'approve',
      reason: undefined,
    })
  })

  it('times out pending requests', async () => {
    vi.useFakeTimers()
    try {
      const gate = new IpcApprovalGate({ timeoutMs: 50 })
      const pending = gate.request(mkCall('t6'))
      const handled = pending.catch((e: unknown) =>
        e instanceof Error ? e.message : String(e),
      )
      vi.advanceTimersByTime(60)
      const message = await handled
      expect(message).toContain('timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancelAll rejects every pending request', async () => {
    const gate = new IpcApprovalGate()
    const p1 = gate.request(mkCall('tA'))
    const p2 = gate.request(mkCall('tB'))
    const r1 = p1.catch((e: Error) => e.message)
    const r2 = p2.catch((e: Error) => e.message)
    gate.cancelAll('aborted')
    await expect(r1).resolves.toBe('aborted')
    await expect(r2).resolves.toBe('aborted')
    expect(gate.listPending()).toEqual([])
  })

  it('resolve for unknown id is a noop', () => {
    const gate = new IpcApprovalGate()
    expect(() => gate.resolve('nope', 'approve')).not.toThrow()
  })

  it('supersedes duplicate id by rejecting the old pending request', async () => {
    const gate = new IpcApprovalGate()
    const p1 = gate.request(mkCall('dup'))
    const r1 = p1.catch((e: Error) => e.message)
    const p2 = gate.request(mkCall('dup'))
    gate.resolve('dup', 'approve')
    await expect(r1).resolves.toContain('Superseded')
    await expect(p2).resolves.toEqual({ decision: 'approve', reason: undefined })
  })
})
