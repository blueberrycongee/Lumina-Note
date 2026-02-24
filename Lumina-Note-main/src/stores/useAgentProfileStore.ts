import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAIConfig, setAIConfig, type AIConfig } from "@/services/ai/ai";

export interface AgentProfile {
  id: string;
  name: string;
  config: AIConfig;
  autoApprove: boolean;
}

interface AgentProfileState {
  profiles: AgentProfile[];
  currentProfileId: string | null;
  createProfileFromCurrent: (name: string, autoApprove?: boolean) => AgentProfile | null;
  updateProfile: (id: string, updates: Partial<Omit<AgentProfile, "id">>) => void;
  removeProfile: (id: string) => void;
  setCurrentProfile: (id: string | null, applyToDesktop?: boolean) => void;
  getProfileById: (id: string) => AgentProfile | undefined;
}

function buildProfileId(name: string) {
  const base = name.trim().toLowerCase().replace(/\s+/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `profile-${base || "agent"}-${suffix}`;
}

export const useAgentProfileStore = create<AgentProfileState>()(
  persist(
    (set, get) => ({
      profiles: [],
      currentProfileId: null,
      createProfileFromCurrent: (name, autoApproveOverride) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const currentConfig = getAIConfig();
        const autoApprove = autoApproveOverride ?? false;
        const profile: AgentProfile = {
          id: buildProfileId(trimmed),
          name: trimmed,
          config: { ...currentConfig },
          autoApprove,
        };
        set(state => ({
          profiles: [...state.profiles, profile],
          currentProfileId: profile.id,
        }));
        return profile;
      },
      updateProfile: (id, updates) => {
        set(state => ({
          profiles: state.profiles.map(profile => {
            if (profile.id !== id) return profile;
            return {
              ...profile,
              ...updates,
              config: updates.config ? { ...updates.config } : profile.config,
            };
          }),
        }));
      },
      removeProfile: (id) => {
        set(state => {
          const next = state.profiles.filter(profile => profile.id !== id);
          const currentProfileId = state.currentProfileId === id ? (next[0]?.id ?? null) : state.currentProfileId;
          return { profiles: next, currentProfileId };
        });
      },
      setCurrentProfile: (id, applyToDesktop) => {
        set({ currentProfileId: id });
        if (applyToDesktop && id) {
          const profile = get().profiles.find(p => p.id === id);
          if (profile) {
            setAIConfig(profile.config);
          }
        }
      },
      getProfileById: (id) => get().profiles.find(profile => profile.id === id),
    }),
    {
      name: "lumina-agent-profiles",
      partialize: (state) => ({
        profiles: state.profiles,
        currentProfileId: state.currentProfileId,
      }),
    }
  )
);
