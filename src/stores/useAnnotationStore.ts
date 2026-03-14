import { create } from 'zustand';
import type {
  AnnotationDetail,
  CreateAnnotationRequest,
  CreateAnnotationReplyRequest,
} from '@/services/team/types';
import * as teamApi from '@/services/team/client';

interface AnnotationState {
  // Connection (non-persisted)
  baseUrl: string;
  token: string;
  currentOrgId: string | null;

  // State
  annotations: AnnotationDetail[];
  activeAnnotationId: string | null;
  currentDocPath: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  setConnection: (baseUrl: string, token: string) => void;
  setOrgId: (orgId: string | null) => void;
  fetchAnnotations: (docPath: string) => Promise<void>;
  createAnnotation: (req: CreateAnnotationRequest) => Promise<AnnotationDetail>;
  replyToAnnotation: (annotationId: string, req: CreateAnnotationReplyRequest) => Promise<void>;
  resolveAnnotation: (annotationId: string) => Promise<void>;
  selectAnnotation: (annotationId: string | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  // Connection
  baseUrl: '',
  token: '',
  currentOrgId: null,

  // Initial state
  annotations: [],
  activeAnnotationId: null,
  currentDocPath: null,
  loading: false,
  error: null,

  setConnection: (baseUrl: string, token: string) => {
    set({ baseUrl, token });
  },

  setOrgId: (orgId: string | null) => {
    set({ currentOrgId: orgId });
  },

  fetchAnnotations: async (docPath: string) => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    set({ loading: true, error: null, currentDocPath: docPath });
    try {
      const annotations = await teamApi.listAnnotations(baseUrl, token, currentOrgId, docPath);
      set({ annotations, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  createAnnotation: async (req: CreateAnnotationRequest) => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      throw new Error('No organization selected');
    }
    set({ error: null });
    try {
      const annotation = await teamApi.createAnnotation(baseUrl, token, currentOrgId, req);
      // Re-fetch annotations for the current document
      const annotations = await teamApi.listAnnotations(
        baseUrl,
        token,
        currentOrgId,
        req.doc_path
      );
      set({ annotations, currentDocPath: req.doc_path });
      return annotation;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  replyToAnnotation: async (annotationId: string, req: CreateAnnotationReplyRequest) => {
    const { baseUrl, token, currentOrgId, currentDocPath } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    if (!currentDocPath) {
      set({ error: 'No document loaded' });
      return;
    }
    set({ error: null });
    try {
      await teamApi.createAnnotationReply(baseUrl, token, annotationId, req);
      // Re-fetch to update replies list
      const annotations = await teamApi.listAnnotations(
        baseUrl,
        token,
        currentOrgId,
        currentDocPath
      );
      set({ annotations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  resolveAnnotation: async (annotationId: string) => {
    const { baseUrl, token, currentOrgId, currentDocPath } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    if (!currentDocPath) {
      set({ error: 'No document loaded' });
      return;
    }
    set({ error: null });
    try {
      await teamApi.resolveAnnotation(baseUrl, token, annotationId);
      // Re-fetch to reflect resolved state
      const annotations = await teamApi.listAnnotations(
        baseUrl,
        token,
        currentOrgId,
        currentDocPath
      );
      set({ annotations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  selectAnnotation: (annotationId: string | null) => {
    set({ activeAnnotationId: annotationId });
  },
}));
