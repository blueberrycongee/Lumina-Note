import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramView } from "./DiagramView";

const readFileMock = vi.fn();
const saveFileMock = vi.fn();

vi.mock("@/lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    readFile: (...args: unknown[]) => readFileMock(...args),
    saveFile: (...args: unknown[]) => saveFileMock(...args),
  };
});

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    CaptureUpdateAction: {
      NEVER: "NEVER",
    },
    restore: (scene: Record<string, unknown> | null) => ({
      elements: (scene?.elements as unknown[]) ?? [],
      appState: (scene?.appState as Record<string, unknown>) ?? {},
      files: (scene?.files as Record<string, unknown>) ?? {},
    }),
    serializeAsJSON: (
      elements: unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => JSON.stringify({ elements, appState, files }),
    Excalidraw: ({ excalidrawAPI }: { excalidrawAPI?: (api: unknown) => void }) => {
      excalidrawAPI?.({
        addFiles: () => undefined,
        updateScene: () => undefined,
      });
      return React.createElement("div", { "data-testid": "excalidraw-mock" });
    },
  };
});

const MINIMAL_SCENE = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [],
  appState: {},
  files: {},
});

describe("DiagramView", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    saveFileMock.mockReset();

    readFileMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          window.setTimeout(() => resolve(MINIMAL_SCENE), 10);
        }),
    );
    saveFileMock.mockResolvedValue(undefined);
  });

  it("exits loading state in StrictMode after async scene load", async () => {
    const filePath = "/tmp/diagram-flow.diagram.json";

    render(
      <StrictMode>
        <DiagramView filePath={filePath} />
      </StrictMode>,
    );

    expect(await screen.findByText(filePath)).toBeInTheDocument();
    expect(screen.getByTestId("excalidraw-mock")).toBeInTheDocument();
    expect(readFileMock).toHaveBeenCalledWith(filePath);
  });
});

