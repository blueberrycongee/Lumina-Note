import { useCallback, useEffect, useMemo, useState } from "react";
import { TypesettingDocumentPane } from "@/components/typesetting/TypesettingDocumentPane";
import { useTypesettingDocStore } from "@/stores/useTypesettingDocStore";
import { decodeBase64ToBytes, encodeBytesToBase64 } from "@/typesetting/base64";

const HARNESS_DEFAULT_PATH = "C:/__lumina_harness__/input.docx";

type TypesettingHarnessApi = {
  loadDocxBase64: (base64: string, fileName?: string) => Promise<void>;
  exportPdfBase64: () => Promise<string>;
  exportLayoutJson: () => Promise<string>;
  setFontBase64: (base64: string, fontName?: string, fileName?: string) => Promise<void>;
};

declare global {
  interface Window {
    __luminaTypesettingHarness?: TypesettingHarnessApi;
    __luminaTypesettingReady?: boolean;
    __luminaTypesettingStatus?: {
      docPath: string;
      docLoaded: boolean;
      exporterReady: boolean;
      ready: boolean;
    };
    __luminaTypesettingLayout?: unknown;
    __luminaTypesettingFont?: {
      name: string;
      fileName: string;
      data: string;
    };
  }
}

export function TypesettingExportHarness() {
  const { docs, openDocFromBytes } = useTypesettingDocStore();
  const [docPath, setDocPath] = useState(HARNESS_DEFAULT_PATH);
  const [exporter, setExporter] = useState<(() => Promise<Uint8Array>) | null>(null);
  const [fontAsset, setFontAsset] = useState<{
    name: string;
    fileName: string;
    data: string;
  } | null>(null);

  const docReady = useMemo(() => Boolean(docs[docPath]) && Boolean(exporter), [docs, docPath, exporter]);

  const loadDocxBase64 = useCallback(async (base64: string, fileName?: string) => {
    const bytes = decodeBase64ToBytes(base64);
    const targetPath = fileName
      ? `C:/__lumina_harness__/${fileName}`
      : HARNESS_DEFAULT_PATH;
    setDocPath(targetPath);
    await openDocFromBytes(targetPath, bytes);
  }, [openDocFromBytes]);

  const exportPdfBase64 = useCallback(async () => {
    if (!exporter) {
      throw new Error("Typesetting export not ready");
    }
    const bytes = await exporter();
    return encodeBytesToBase64(bytes);
  }, [exporter]);

  const exportLayoutJson = useCallback(async () => {
    if (!window.__luminaTypesettingLayout) {
      throw new Error("Typesetting layout not ready");
    }
    return JSON.stringify(window.__luminaTypesettingLayout);
  }, []);

  const setFontBase64 = useCallback(async (base64: string, fontName?: string, fileName?: string) => {
    setFontAsset({
      name: fontName ?? "SimHei",
      fileName: fileName ?? "simhei.ttf",
      data: base64,
    });
  }, []);

  useEffect(() => {
    window.__luminaTypesettingHarness = {
      loadDocxBase64,
      exportPdfBase64,
      exportLayoutJson,
      setFontBase64,
    };
    return () => {
      delete window.__luminaTypesettingHarness;
    };
  }, [exportLayoutJson, exportPdfBase64, loadDocxBase64, setFontBase64]);

  useEffect(() => {
    window.__luminaTypesettingReady = docReady;
    return () => {
      delete window.__luminaTypesettingReady;
    };
  }, [docReady]);

  useEffect(() => {
    window.__luminaTypesettingStatus = {
      docPath,
      docLoaded: Boolean(docs[docPath]),
      exporterReady: Boolean(exporter),
      ready: docReady,
    };
    return () => {
      delete window.__luminaTypesettingStatus;
    };
  }, [docPath, docReady, docs, exporter]);

  useEffect(() => {
    if (fontAsset) {
      window.__luminaTypesettingFont = fontAsset;
    } else {
      delete window.__luminaTypesettingFont;
    }
    return () => {
      delete window.__luminaTypesettingFont;
    };
  }, [fontAsset]);

  return (
    <div className="min-h-screen bg-background">
      <TypesettingDocumentPane path={docPath} onExportReady={setExporter} autoOpen={false} />
    </div>
  );
}
