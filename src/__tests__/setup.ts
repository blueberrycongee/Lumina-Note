/**
 * Vitest 测试设置文件
 */
import { vi } from 'vitest';
import '@testing-library/jest-dom';

function ensureStorageSupport(kind: 'localStorage' | 'sessionStorage') {
  const existing = globalThis[kind];
  if (existing && typeof existing.getItem === 'function' && typeof existing.setItem === 'function') {
    return;
  }

  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, kind, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: storage,
  });
}

ensureStorageSupport('localStorage');
ensureStorageSupport('sessionStorage');

// Most unit tests assert Chinese UI copy. Make the locale deterministic in CI
// (jsdom defaults to en-US) by pre-seeding the persisted locale store.
try {
  localStorage.setItem('lumina-locale', JSON.stringify({ state: { locale: 'zh-CN' } }));
} catch {
  // ignore (jsdom/localStorage not available)
}

function ensureResizableBufferSupport() {
  const define = (ctor: typeof ArrayBuffer | typeof SharedArrayBuffer | undefined) => {
    if (!ctor?.prototype) return;
    if (!Object.getOwnPropertyDescriptor(ctor.prototype, "resizable")) {
      Object.defineProperty(ctor.prototype, "resizable", { get: () => false });
    }
    if (!Object.getOwnPropertyDescriptor(ctor.prototype, "maxByteLength")) {
      Object.defineProperty(ctor.prototype, "maxByteLength", {
        get() {
          return this.byteLength;
        },
      });
    }
  };

  define(ArrayBuffer);
  if (typeof SharedArrayBuffer !== "undefined") {
    define(SharedArrayBuffer);
  }
}

ensureResizableBufferSupport();

const tauriInvokeBridge = async <T = unknown>(
  _cmd?: string,
  _args?: Record<string, unknown>,
  _options?: unknown,
): Promise<T> => undefined as T;

if (typeof window !== "undefined") {
  (window as typeof window & {
    __TAURI__?: { core?: { invoke?: typeof tauriInvokeBridge } };
  }).__TAURI__ = {
    core: { invoke: tauriInvokeBridge },
  };
}

// Mock low-level host bridge so BOTH @/lib/host re-exports AND the internal
// calls inside @/lib/host's helpers (which import invoke from ./hostBridge)
// route through the same mock.
vi.mock('@/lib/hostBridge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hostBridge')>(
    '@/lib/hostBridge',
  );
  return {
    ...actual,
    isTauriAvailable: vi.fn(() => false),
    isTauri: vi.fn(() => false),
    listen: vi.fn(() => Promise.resolve(() => {})),
    invoke: vi.fn((cmd: string, args?: unknown) => {
    // 根据命令名返回模拟数据
    const mockResponses: Record<string, unknown> = {
      // 文件操作
      'read_file': '# Mock Content\n\nThis is mock file content.',
      'save_file': undefined,
      'list_files': ['note1.md', 'note2.md', 'folder/note3.md'],
      'file_exists': true,
      'create_directory': undefined,
      'delete_file': undefined,
      'rename_file': undefined,
      'move_file': undefined,
      
      // Agent 相关
      'agent_start_task': { taskId: 'mock-task-id' },
      'agent_abort': undefined,
      'agent_get_status': { status: 'idle' },
      'agent_get_queue_status': { running: false, queued: [] },
      'agent_get_provider_settings': {
        activeProviderId: 'openai',
        perProvider: {},
      },
      'agent_has_provider_api_key': false,

      // 数据库相关
      'query_database': { rows: [] },
      
      // 系统信息
      'get_workspace_path': '/mock/workspace',
      'get_debug_log_path': '/mock/logs',
    };

    const response = mockResponses[cmd];
    if (response !== undefined) {
      return Promise.resolve(response);
    }

    // 默认返回 null
    console.log(`[Mock invoke] 未处理的命令: ${cmd}`, args);
    return Promise.resolve(null);
    }),
  };
});

// pdfjs-dist depends on browser-only APIs (e.g. DOMMatrix) that jsdom doesn't provide.
// Components import this module for side-effects; no-op it for unit tests.
vi.mock('@/pdfWorker', () => ({}));

// Global test utilities
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock window.matchMedia (jsdom only)
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom lacks text range geometry used by CodeMirror selection layers.
if (typeof Range !== "undefined" && !(Range.prototype as unknown as { getClientRects?: unknown }).getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

// jsdom doesn't implement scrollIntoView; some components call it in effects.
if (typeof Element !== "undefined" && !(Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView) {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
}

// pdfjs/react-pdf expect browser geometry APIs that jsdom doesn't provide.
// A lightweight shim is enough for our unit tests (no real canvas rendering).
if (!(globalThis as { DOMMatrix?: unknown }).DOMMatrix) {
  class DOMMatrixShim {}
  (globalThis as { DOMMatrix: unknown }).DOMMatrix = DOMMatrixShim;
}
if (!(globalThis as { ImageData?: unknown }).ImageData) {
  class ImageDataShim {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = width ?? 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = width ?? 0;
        this.height = height ?? 0;
      }
    }
  }
  (globalThis as { ImageData: unknown }).ImageData = ImageDataShim;
}
if (!(globalThis as { Path2D?: unknown }).Path2D) {
  class Path2DShim {}
  (globalThis as { Path2D: unknown }).Path2D = Path2DShim;
}
