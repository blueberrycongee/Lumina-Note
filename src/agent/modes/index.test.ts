/**
 * Agent 模式测试
 */
import { describe, it, expect, vi } from 'vitest';

// Mock locale store
vi.mock('@/stores/useLocaleStore', () => ({
  getCurrentTranslations: vi.fn(() => ({
    prompts: {
      agent: {
        modes: {
          editor: { name: 'Editor', roleDefinition: 'Edit notes' },
          organizer: { name: 'Organizer', roleDefinition: 'Organize notes' },
          researcher: { name: 'Researcher', roleDefinition: 'Research topics' },
          writer: { name: 'Writer', roleDefinition: 'Write content' },
        },
      },
    },
  })),
}));

import { MODES, getMode, getModeList } from './index';

describe('Agent Modes', () => {
  describe('MODES', () => {
    it('should have editor mode', () => {
      const editor = MODES.editor;
      expect(editor).toBeDefined();
      expect(editor.slug).toBe('editor');
      expect(editor.name).toBe('Editor');
    });

    it('should have organizer mode', () => {
      const organizer = MODES.organizer;
      expect(organizer).toBeDefined();
      expect(organizer.slug).toBe('organizer');
    });

    it('should have researcher mode', () => {
      const researcher = MODES.researcher;
      expect(researcher).toBeDefined();
      expect(researcher.slug).toBe('researcher');
    });

    it('should have writer mode', () => {
      const writer = MODES.writer;
      expect(writer).toBeDefined();
      expect(writer.slug).toBe('writer');
    });

    it('should have icons for all modes', () => {
      expect(MODES.editor.icon).toBe('pencil');
      expect(MODES.organizer.icon).toBe('folder');
      expect(MODES.researcher.icon).toBe('search');
      expect(MODES.writer.icon).toBe('pen-tool');
    });

    it('should have tools for editor mode', () => {
      const tools = MODES.editor.tools;
      expect(tools).toContain('read_note');
      expect(tools).toContain('edit_note');
      expect(tools).toContain('list_notes');
    });

    it('should have tools for organizer mode', () => {
      const tools = MODES.organizer.tools;
      expect(tools).toContain('delete_note');
      expect(tools).toContain('move_file');
      expect(tools).toContain('rename_file');
    });

    it('should have tools for researcher mode', () => {
      const tools = MODES.researcher.tools;
      expect(tools).toContain('semantic_search');
      expect(tools).toContain('deep_search');
    });

    it('should have tools for writer mode', () => {
      const tools = MODES.writer.tools;
      expect(tools).toContain('create_note');
      expect(tools).toContain('create_folder');
    });
  });

  describe('getMode', () => {
    it('should return editor mode', () => {
      const mode = getMode('editor');
      expect(mode.slug).toBe('editor');
      expect(mode.name).toBe('Editor');
      expect(mode.roleDefinition).toBe('Edit notes');
    });

    it('should return organizer mode', () => {
      const mode = getMode('organizer');
      expect(mode.slug).toBe('organizer');
    });

    it('should return researcher mode', () => {
      const mode = getMode('researcher');
      expect(mode.slug).toBe('researcher');
    });

    it('should return writer mode', () => {
      const mode = getMode('writer');
      expect(mode.slug).toBe('writer');
    });
  });

  describe('getModeList', () => {
    it('should return all 4 modes', () => {
      const modes = getModeList();
      expect(modes).toHaveLength(4);
    });

    it('should include all mode slugs', () => {
      const modes = getModeList();
      const slugs = modes.map(m => m.slug);
      
      expect(slugs).toContain('editor');
      expect(slugs).toContain('organizer');
      expect(slugs).toContain('researcher');
      expect(slugs).toContain('writer');
    });

    it('should have name and roleDefinition for each mode', () => {
      const modes = getModeList();
      
      modes.forEach(mode => {
        expect(mode.name).toBeTruthy();
        expect(mode.roleDefinition).toBeTruthy();
        expect(mode.icon).toBeTruthy();
        expect(mode.tools).toBeDefined();
        expect(mode.tools.length).toBeGreaterThan(0);
      });
    });
  });
});
