export interface SkillInfo {
  name: string;
  title: string;
  description?: string;
  version?: string;
  tags?: string[];
  source?: string;
}

export interface SkillDetail {
  info: SkillInfo;
  prompt: string;
  markdown?: string;
}

export interface SelectedSkill {
  name: string;
  title: string;
  description?: string;
  prompt: string;
  source?: string;
}
