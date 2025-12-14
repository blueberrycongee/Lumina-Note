/**
 * utils.ts 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cn, debounce, getFileName, getRelativePath } from './utils';

describe('cn (className merge)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('should merge tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce function calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to debounced function', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('getFileName', () => {
  it('should extract filename without .md extension', () => {
    expect(getFileName('notes/daily/2024-01-01.md')).toBe('2024-01-01');
  });

  it('should handle Windows paths', () => {
    expect(getFileName('C:\\Users\\notes\\test.md')).toBe('test');
  });

  it('should handle paths without extension', () => {
    expect(getFileName('notes/readme')).toBe('readme');
  });

  it('should handle empty path', () => {
    expect(getFileName('')).toBe('');
  });

  it('should handle filename with multiple dots', () => {
    expect(getFileName('notes/file.name.md')).toBe('file.name');
  });
});

describe('getRelativePath', () => {
  it('should get relative path from vault root', () => {
    expect(getRelativePath('/vault/notes/test.md', '/vault')).toBe('notes/test.md');
  });

  it('should handle Windows paths', () => {
    expect(getRelativePath('C:\\vault\\notes\\test.md', 'C:\\vault')).toBe('notes\\test.md');
  });

  it('should handle trailing slash in vault path', () => {
    expect(getRelativePath('/vault/notes/test.md', '/vault/')).toBe('notes/test.md');
  });
});
