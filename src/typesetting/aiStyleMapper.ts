import { TypesettingAiInstruction } from "./aiSchema";

export type TypesettingStyleConfig = {
  page: Omit<TypesettingAiInstruction["page"], "footerHeight"> & {
    footerHeight: string;
  };
  typography: TypesettingAiInstruction["typography"];
  paragraph: TypesettingAiInstruction["paragraph"];
};

export function applyAiInstructionToStyles(
  base: TypesettingStyleConfig,
  instruction: TypesettingAiInstruction,
): TypesettingStyleConfig {
  return {
    page: {
      ...base.page,
      ...instruction.page,
      footerHeight: instruction.page.footerHeight ?? base.page.footerHeight,
    },
    typography: {
      zh: { ...base.typography.zh, ...instruction.typography.zh },
      en: { ...base.typography.en, ...instruction.typography.en },
    },
    paragraph: {
      ...base.paragraph,
      ...instruction.paragraph,
    },
  };
}
