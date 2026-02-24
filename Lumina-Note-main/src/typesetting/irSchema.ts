import { z } from "zod";

const idSchema = z.string().min(1);
const lengthSchema = z.string().min(1);

const inlineTextSchema = z.object({
  id: idSchema,
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(z.enum(["bold", "italic", "underline", "strike", "code"])).optional(),
  styleId: z.string().optional(),
});

const inlineLineBreakSchema = z.object({
  id: idSchema,
  type: z.literal("lineBreak"),
});

let inlineSchema: z.ZodTypeAny;
let blockSchema: z.ZodTypeAny;

const inlineSpanSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("span"),
  marks: z.array(z.enum(["bold", "italic", "underline", "strike", "code"])).optional(),
  styleId: z.string().optional(),
  children: z.array(inlineSchema),
}));

const inlineLinkSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("link"),
  href: z.string().min(1),
  children: z.array(inlineSchema),
}));

inlineSchema = z.lazy(() => z.union([
  inlineTextSchema,
  inlineLineBreakSchema,
  inlineSpanSchema,
  inlineLinkSchema,
]));

const paragraphSchema = z.object({
  id: idSchema,
  type: z.literal("paragraph"),
  styleId: z.string().optional(),
  children: z.array(inlineSchema),
});

const headingSchema = z.object({
  id: idSchema,
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  styleId: z.string().optional(),
  children: z.array(inlineSchema),
});

const listItemSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("listItem"),
  blocks: z.array(blockSchema),
}));

const listSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("list"),
  ordered: z.boolean(),
  styleId: z.string().optional(),
  items: z.array(listItemSchema),
}));

const tableCellSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("tableCell"),
  rowSpan: z.number().int().min(1).optional(),
  colSpan: z.number().int().min(1).optional(),
  blocks: z.array(blockSchema),
}));

const tableRowSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("tableRow"),
  cells: z.array(tableCellSchema),
}));

const tableSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: idSchema,
  type: z.literal("table"),
  styleId: z.string().optional(),
  rows: z.array(tableRowSchema),
}));

const imageSchema = z.object({
  id: idSchema,
  type: z.literal("image"),
  embedId: z.string().min(1),
  alt: z.string().optional(),
  width: lengthSchema.optional(),
  height: lengthSchema.optional(),
});

const pageBreakSchema = z.object({
  id: idSchema,
  type: z.literal("pageBreak"),
});

const sectionBreakSchema = z.object({
  id: idSchema,
  type: z.literal("sectionBreak"),
  sectionId: z.string().optional(),
});

blockSchema = z.lazy(() => z.union([
  paragraphSchema,
  headingSchema,
  listSchema,
  tableSchema,
  imageSchema,
  pageBreakSchema,
  sectionBreakSchema,
]));

export const typesettingIrSchema = z.object({
  version: z.number().int().min(1),
  id: idSchema,
  meta: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional(),
  blocks: z.array(blockSchema),
  headers: z.array(blockSchema).optional(),
  footers: z.array(blockSchema).optional(),
});

export type TypesettingIrDocument = z.infer<typeof typesettingIrSchema>;
export type TypesettingIrBlock = z.infer<typeof blockSchema>;
export type TypesettingIrInline = z.infer<typeof inlineSchema>;
