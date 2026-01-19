/**
 * Vitest 测试设置文件
 */
import { vi } from 'vitest';
import '@testing-library/jest-dom';

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

// Mock Tauri API - 智能 Mock，根据命令名返回模拟数据
vi.mock('@tauri-apps/api/core', () => ({
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
      
      // RAG 相关
      'search_notes': [],
      'semantic_search': [],
      'get_embeddings': [[0.1, 0.2, 0.3]],
      
      // 数据库相关
      'query_database': { rows: [] },
      
      // 系统信息
      'get_workspace_path': '/mock/workspace',
      'get_debug_log_path': '/mock/logs',
      'typesetting_preview_page_mm': {
        page: { x_mm: 0, y_mm: 0, width_mm: 210, height_mm: 297 },
        body: { x_mm: 25, y_mm: 37, width_mm: 160, height_mm: 223 },
        header: { x_mm: 25, y_mm: 25, width_mm: 160, height_mm: 12 },
        footer: { x_mm: 25, y_mm: 260, width_mm: 160, height_mm: 12 },
      },
      'typesetting_export_pdf_base64': 'JVBERi0xLjcK',
      'typesetting_fixture_font_path': 'C:\\mock\\fonts\\katex-main-regular.ttf',
      'typesetting_layout_text': {
        lines: [
          { start: 0, end: 5, width: 200, x_offset: 0, y_offset: 0 },
          { start: 6, end: 12, width: 180, x_offset: 0, y_offset: 20 },
        ],
      },
    };

    const response = mockResponses[cmd];
    if (response !== undefined) {
      return Promise.resolve(response);
    }
    
    // 默认返回 null
    console.log(`[Mock invoke] 未处理的命令: ${cmd}`, args);
    return Promise.resolve(null);
  }),
  isTauri: vi.fn(() => false),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  confirm: vi.fn(),
}));

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

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
