import { create } from 'zustand';
import type { OrgSummary, OrgDetail, ProjectSummary } from '@/services/team/types';
import * as teamApi from '@/services/team/client';

interface OrgState {
  // Connection (non-persisted)
  baseUrl: string;
  token: string;

  // State
  orgs: OrgSummary[];
  currentOrgId: string | null;
  currentOrg: OrgDetail | null;
  projects: ProjectSummary[];
  currentProjectId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  setConnection: (baseUrl: string, token: string) => void;
  fetchOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<OrgSummary>;
  switchOrg: (orgId: string) => Promise<void>;
  updateOrg: (orgId: string, name: string) => Promise<void>;

  // Member management
  addMember: (email: string, role: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;

  // Project management
  fetchProjects: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<ProjectSummary>;
  switchProject: (projectId: string) => void;
}

export const useOrgStore = create<OrgState>((set, get) => ({
  // Connection
  baseUrl: '',
  token: '',

  // Initial state
  orgs: [],
  currentOrgId: null,
  currentOrg: null,
  projects: [],
  currentProjectId: null,
  loading: false,
  error: null,

  setConnection: (baseUrl: string, token: string) => {
    set({ baseUrl, token });
  },

  fetchOrgs: async () => {
    const { baseUrl, token } = get();
    set({ loading: true, error: null });
    try {
      const orgs = await teamApi.listOrgs(baseUrl, token);
      set({ orgs, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  createOrg: async (name: string) => {
    const { baseUrl, token } = get();
    set({ error: null });
    try {
      const org = await teamApi.createOrg(baseUrl, token, { name });
      // Refresh the list after creation
      const orgs = await teamApi.listOrgs(baseUrl, token);
      set({ orgs });
      return org;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  switchOrg: async (orgId: string) => {
    const { baseUrl, token } = get();
    set({ loading: true, error: null, currentOrgId: orgId, currentProjectId: null });
    try {
      const detail = await teamApi.getOrg(baseUrl, token, orgId);
      set({ currentOrg: detail });
      // Fetch projects for the new org
      const projects = await teamApi.listProjects(baseUrl, token, orgId);
      set({ projects, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  updateOrg: async (orgId: string, name: string) => {
    const { baseUrl, token } = get();
    set({ error: null });
    try {
      await teamApi.updateOrg(baseUrl, token, orgId, { name });
      // Refresh the org detail if it is the current org
      if (get().currentOrgId === orgId) {
        const detail = await teamApi.getOrg(baseUrl, token, orgId);
        set({ currentOrg: detail });
      }
      // Refresh the org list to reflect the name change
      const orgs = await teamApi.listOrgs(baseUrl, token);
      set({ orgs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  addMember: async (email: string, role: string) => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    set({ error: null });
    try {
      await teamApi.addOrgMember(baseUrl, token, currentOrgId, { email, role });
      // Refresh current org detail to update member list
      const detail = await teamApi.getOrg(baseUrl, token, currentOrgId);
      set({ currentOrg: detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  removeMember: async (userId: string) => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    set({ error: null });
    try {
      await teamApi.removeOrgMember(baseUrl, token, currentOrgId, userId);
      // Refresh current org detail to update member list
      const detail = await teamApi.getOrg(baseUrl, token, currentOrgId);
      set({ currentOrg: detail });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  fetchProjects: async () => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      return;
    }
    set({ error: null });
    try {
      const projects = await teamApi.listProjects(baseUrl, token, currentOrgId);
      set({ projects });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  createProject: async (name: string, description?: string) => {
    const { baseUrl, token, currentOrgId } = get();
    if (!currentOrgId) {
      set({ error: 'No organization selected' });
      throw new Error('No organization selected');
    }
    set({ error: null });
    try {
      const project = await teamApi.createProject(baseUrl, token, currentOrgId, {
        name,
        description,
      });
      // Refresh the project list
      const projects = await teamApi.listProjects(baseUrl, token, currentOrgId);
      set({ projects });
      return project;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  switchProject: (projectId: string) => {
    set({ currentProjectId: projectId });
  },
}));
