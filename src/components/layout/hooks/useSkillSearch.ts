import { useState, useEffect, useMemo, useCallback, useRef } from "react";

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
  const loadGenerationRef = useRef(0);
  const retriedForOpenMenuRef = useRef(false);

  const loadSkills = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setSkillsLoading(true);
    try {
      const items = await listOpencodeSkills();
      if (generation !== loadGenerationRef.current) return;
      setSkills(items);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      console.warn("[Skills] Failed to load skills:", err);
      setSkills([]);
    } finally {
      if (generation === loadGenerationRef.current) {
        setSkillsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSkills();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [loadSkills]);

  useEffect(() => {
    if (!showSkillMenu) {
      retriedForOpenMenuRef.current = false;
      return;
    }
    if (retriedForOpenMenuRef.current || skillsLoading || skills.length > 0) {
      return;
    }
    retriedForOpenMenuRef.current = true;
    void loadSkills();
  }, [loadSkills, showSkillMenu, skills.length, skillsLoading]);

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
    reloadSkills: loadSkills,
    handleSelectSkill,
  };
}
