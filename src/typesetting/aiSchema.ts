import { z } from "zod";

const lengthRegex = /^\d+(\.\d+)?(mm|cm|in|pt|px|em|rem)$/;
const length = z
  .string()
  .regex(lengthRegex, "Expected a length with unit (mm|cm|in|pt|px|em|rem)");

const fontSize = z
  .string()
  .regex(/^\d+(\.\d+)?pt$/, "Expected a font size in points (pt)");

const typographySchema = z
  .object({
    font: z.string().min(1),
    size: fontSize,
  })
  .strict();

export const typesettingAiSchema = z
  .object({
    page: z
      .object({
        size: z.enum(["A4", "Letter", "Custom"]),
        margin: length,
        headerHeight: length,
        footerHeight: length.optional(),
      })
      .strict(),
    typography: z
      .object({
        zh: typographySchema,
        en: typographySchema,
      })
      .strict(),
    paragraph: z
      .object({
        lineHeight: z.number().positive(),
        indent: length,
        align: z.enum(["left", "right", "center", "justify"]),
      })
      .strict(),
  })
  .strict();

export type TypesettingAiInstruction = z.infer<typeof typesettingAiSchema>;
