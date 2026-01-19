import { parseAiPromptToSchema } from "./aiPromptParser";
import { applyAiInstructionToStyles, TypesettingStyleConfig } from "./aiStyleMapper";
import { TypesettingAiInstruction } from "./aiSchema";

export type TypesettingAiIntentResult = {
  instruction: TypesettingAiInstruction;
  styles: TypesettingStyleConfig;
};

export function applyAiPromptToStyles(
  prompt: string | null | undefined,
  base: TypesettingStyleConfig,
): TypesettingAiIntentResult {
  const instruction = parseAiPromptToSchema(prompt ?? "");
  return {
    instruction,
    styles: applyAiInstructionToStyles(base, instruction),
  };
}
