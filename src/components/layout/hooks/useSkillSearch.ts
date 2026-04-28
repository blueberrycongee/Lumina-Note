import { useState, useEffect, useMemo, useCallback } from "react";

import { listOpencodeSkills } from "@/services/opencode/skills";
import type { OpencodeSkillInfo } from "@/services/opencode/skills";
import type { SelectedSkill } from "@/types/skills";

/**
 * Skill discovery + selection for the chat input.
 *
 * Lists opencode-discovered skills (built-in + vault + global) so the
 * "@skill" popover can suggest them. Selected skills become chips above
 * the input; the agent already sees them in `<available_skills>` so
 * selection is informational from its perspective — the chip is just a
 * UX cue for the user.
 */
export function useSkillSearch() {
  const [skills, setSkills] = useState<OpencodeSkillInfo[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setSkillsLoading(true);
    listOpencodeSkills()
      .then((items) => {
        if (!active) return;
        setSkills(items);
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
  }, []);

  const filteredSkills = useMemo(() => {
    if (!skills?.length) return [];
    const q = skillQuery.trim().toLowerCase();
    if (!q) return skills.slice(0, 8);
    return skills
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(q) ||
          (skill.description?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [skills, skillQuery]);

  const handleSelectSkill = useCallback(
    (skill: OpencodeSkillInfo) => {
      if (selectedSkills.some((s) => s.name === skill.name)) {
        setShowSkillMenu(false);
        setSkillQuery("");
        return true;
      }
      const next: SelectedSkill = {
        name: skill.name,
        description: skill.description,
        prompt: skill.content,
      };
      setSelectedSkills((prev) => [...prev, next]);
      setShowSkillMenu(false);
      setSkillQuery("");
      return false;
    },
    [selectedSkills],
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
