import type { TypesettingIrBlock, TypesettingIrInline } from "./irSchema";

export type IrTargetRef = {
  id: string;
  path?: number[];
};

export type IrInsertPosition = "before" | "after" | "inside";

export type IrInsertOp = {
  op: "insert";
  target: IrTargetRef;
  position: IrInsertPosition;
  block: TypesettingIrBlock;
};

export type IrReplaceOp = {
  op: "replace";
  target: IrTargetRef;
  block: TypesettingIrBlock;
};

export type IrDeleteOp = {
  op: "delete";
  target: IrTargetRef;
};

export type IrMoveOp = {
  op: "move";
  target: IrTargetRef;
  destination: IrTargetRef;
  position: IrInsertPosition;
};

export type IrStyleOp = {
  op: "style";
  target: IrTargetRef;
  styleId?: string;
  marks?: Array<"bold" | "italic" | "underline" | "strike" | "code">;
};

export type IrInlineReplaceOp = {
  op: "replaceInline";
  target: IrTargetRef;
  inline: TypesettingIrInline;
};

export type TypesettingIrOp =
  | IrInsertOp
  | IrReplaceOp
  | IrDeleteOp
  | IrMoveOp
  | IrStyleOp
  | IrInlineReplaceOp;
