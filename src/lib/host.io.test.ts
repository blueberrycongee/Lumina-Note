import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { readDir as pluginReadDir, rename as pluginRename } from '@tauri-apps/plugin-fs';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  rename: vi.fn(),
}));

import {
  createFile,
  deleteFile,
  exists,
  listDirectory,
  moveFile,
  moveFolder,
  readBinaryFileBase64,
  readDir,
  readFile,
  rename,
  renameFile,
  saveFile,
  writeBinaryFile,
  writeFile,
} from './host';

describe('tauri IO wrappers', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(pluginReadDir).mockReset();
    vi.mocked(pluginRename).mockReset();
  });

  it('routes readFile through invoke', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('hello');
    await expect(readFile('/vault/note.md')).resolves.toBe('hello');
    expect(invoke).toHaveBeenCalledWith('read_file', { path: '/vault/note.md' });
  });

  it('routes saveFile and writeFile through the save_file command', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await saveFile('/vault/note.md', 'body');
    await writeFile('/vault/other.md', 'text');

    expect(invoke).toHaveBeenNthCalledWith(1, 'save_file', { path: '/vault/note.md', content: 'body' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_file', { path: '/vault/other.md', content: 'text' });
  });

  it('routes binary read and write wrappers through invoke', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('YmFzZTY0');

    await writeBinaryFile('/vault/img.png', new Uint8Array([1, 2, 3]));
    await expect(readBinaryFileBase64('/vault/img.png')).resolves.toBe('YmFzZTY0');

    expect(invoke).toHaveBeenNthCalledWith(1, 'write_binary_file', {
      path: '/vault/img.png',
      data: [1, 2, 3],
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'read_binary_file_base64', { path: '/vault/img.png' });
  });

  it('routes listDirectory, createFile, deleteFile, renameFile, exists, moveFile, and moveFolder through invoke', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('/vault/archive/note.md')
      .mockResolvedValueOnce('/vault/archive');

    await listDirectory('/vault');
    await createFile('/vault/new.md');
    await deleteFile('/vault/old.md');
    await renameFile('/vault/old.md', '/vault/new.md');
    await expect(exists('/vault/new.md')).resolves.toBe(true);
    await expect(moveFile('/vault/note.md', '/vault/archive')).resolves.toBe('/vault/archive/note.md');
    await expect(moveFolder('/vault/folder', '/vault/archive')).resolves.toBe('/vault/archive');

    expect(invoke).toHaveBeenNthCalledWith(1, 'list_directory', { path: '/vault' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'create_file', { path: '/vault/new.md' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'delete_file', { path: '/vault/old.md' });
    expect(invoke).toHaveBeenNthCalledWith(4, 'rename_file', { oldPath: '/vault/old.md', newPath: '/vault/new.md' });
    expect(invoke).toHaveBeenNthCalledWith(5, 'path_exists', { path: '/vault/new.md' });
    expect(invoke).toHaveBeenNthCalledWith(6, 'move_file', { source: '/vault/note.md', targetFolder: '/vault/archive' });
    expect(invoke).toHaveBeenNthCalledWith(7, 'move_folder', { source: '/vault/folder', targetFolder: '/vault/archive' });
  });

  it('uses plugin-fs readDir for non-recursive directory reads', async () => {
    vi.mocked(pluginReadDir).mockResolvedValueOnce([
      { name: 'note.md', isDirectory: false },
      { name: 'assets', isDirectory: true },
    ] as never);

    const entries = await readDir('/vault');

    expect(pluginReadDir).toHaveBeenCalledWith('/vault');
    expect(entries).toEqual([
      expect.objectContaining({ name: 'note.md', path: '/vault/note.md', is_dir: false }),
      expect.objectContaining({ name: 'assets', path: '/vault/assets', is_dir: true }),
    ]);
  });

  it('uses listDirectory for recursive directory reads', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ name: 'nested.md', path: '/vault/nested.md' }]);

    await readDir('/vault', { recursive: true });

    expect(pluginReadDir).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('list_directory', { path: '/vault' });
  });

  it('routes rename through plugin-fs', async () => {
    vi.mocked(pluginRename).mockResolvedValueOnce(undefined as never);

    await rename('/vault/old.md', '/vault/new.md');

    expect(pluginRename).toHaveBeenCalledWith('/vault/old.md', '/vault/new.md');
  });
});
