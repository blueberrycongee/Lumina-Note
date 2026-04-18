import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DiagnosticsSection } from './DiagnosticsSection';
import { useUIStore } from '@/stores/useUIStore';

const saveMock = vi.fn();
const writeTextFileMock = vi.fn();
const invokeMock = vi.fn();
const getDebugLogPathMock = vi.fn();
const reportOperationErrorMock = vi.fn();

vi.mock('@/lib/host', async () => {
  const actual = await vi.importActual<typeof import('@/lib/host')>('@/lib/host');
  return {
    ...actual,
    saveDialog: (...args: unknown[]) => saveMock(...args),
    writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
    invoke: (...args: unknown[]) => invokeMock(...args),
  };
});

vi.mock('@/lib/debugLogger', () => ({
  getDebugLogPath: (...args: unknown[]) => getDebugLogPathMock(...args),
}));

vi.mock('@/lib/reportError', () => ({
  reportOperationError: (...args: unknown[]) => reportOperationErrorMock(...args),
}));

describe('DiagnosticsSection', () => {
  beforeEach(() => {
    useUIStore.setState({
      diagnosticsEnabled: false,
      editorInteractionTraceEnabled: false,
    });
    saveMock.mockReset();
    writeTextFileMock.mockReset();
    invokeMock.mockReset();
    getDebugLogPathMock.mockReset();
    reportOperationErrorMock.mockReset();
    getDebugLogPathMock.mockResolvedValue('/tmp/lumina.log');
    (window as any).__luminaEditorTrace = {
      clear: vi.fn(),
      getData: vi.fn(() => ({ events: [{ type: 'content-click' }], frames: [] })),
    };
  });

  it('toggles editor interaction trace recording from diagnostics', () => {
    render(<DiagnosticsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle editor interaction trace' }));

    expect(useUIStore.getState().editorInteractionTraceEnabled).toBe(true);
  });

  it('exports the current interaction trace as json', async () => {
    useUIStore.setState({ editorInteractionTraceEnabled: true });
    saveMock.mockResolvedValue('/tmp/trace.json');
    writeTextFileMock.mockResolvedValue(undefined);

    render(<DiagnosticsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Export editor interaction trace' }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect((window as any).__luminaEditorTrace.getData).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock.mock.calls[0][0]).toBe('/tmp/trace.json');
    expect(writeTextFileMock.mock.calls[0][1]).toContain('content-click');
  });
});
