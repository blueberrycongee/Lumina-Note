import { useState, useEffect, useMemo, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  listAgentSkills,
  readAgentSkill,
  getDocToolsStatus,
  installDocTools,
} from "@/lib/tauri";
import type { SelectedSkill, SkillInfo } from "@/types/skills";

export function useSkillSearch() {
  const vaultPath = useFileStore((s) => s.vaultPath);
  const { t } = useLocaleStore();

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Load available skills
  useEffect(() => {
    let active = true;
    setSkillsLoading(true);
    listAgentSkills(vaultPath || undefined)
      .then((items) => {
        if (!active) return;
        setSkills(Array.isArray(items) ? items : []);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("[Skills] Failed to load skills:", err);
        setSkills([]);
      })
      .finally(() => {
        if (!active) return;
        setSkillsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vaultPath]);

  const filteredSkills = useMemo(() => {
    if (!skills?.length) return [];
    const q = skillQuery.trim().toLowerCase();
    if (!q) return skills.slice(0, 8);
    return skills
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(q) ||
          skill.title.toLowerCase().includes(q) ||
          (skill.description?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [skills, skillQuery]);

  const handleSelectSkill = useCallback(
    async (skill: SkillInfo) => {
      if (selectedSkills.some((s) => s.name === skill.name)) {
        setShowSkillMenu(false);
        setSkillQuery("");
        return true; // already selected, just close menu
      }
      try {
        if (skill.name === "docx") {
          try {
            const status = await getDocToolsStatus();
            if (!status.installed && status.missing.length > 0) {
              const shouldInstall = window.confirm(
                t.settingsModal.docToolsPrompt,
              );
              if (shouldInstall) {
                await installDocTools();
              }
            }
          } catch (err) {
            console.warn("[DocTools] Failed to check/install doc tools:", err);
          }
        }
        const detail = await readAgentSkill(skill.name, vaultPath || undefined);
        const nextSkill: SelectedSkill = {
          name: detail.info.name,
          title: detail.info.title,
          description: detail.info.description,
          prompt: detail.prompt,
          source: detail.info.source,
        };
        setSelectedSkills((prev) => [...prev, nextSkill]);
      } catch (err) {
        console.warn("[Skills] Failed to load skill detail:", err);
      } finally {
        setShowSkillMenu(false);
        setSkillQuery("");
      }
      return false;
    },
    [selectedSkills, vaultPath, t],
  );

  return {
    skills,
    filteredSkills,
    selectedSkills,
    setSelectedSkills,
    skillQuery,
    setSkillQuery,
    showSkillMenu,
    setShowSkillMenu,
    skillsLoading,
    handleSelectSkill,
  };
}
