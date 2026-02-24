declare module "marked-katex-extension" {
  import { MarkedExtension } from "marked";
  
  interface KatexOptions {
    throwOnError?: boolean;
    output?: "html" | "mathml" | "htmlAndMathml";
    displayMode?: boolean;
    errorColor?: string;
    macros?: Record<string, string>;
    minRuleThickness?: number;
    colorIsTextColor?: boolean;
    maxSize?: number;
    maxExpand?: number;
    strict?: boolean | "warn" | "error" | "ignore";
    trust?: boolean | ((context: { command: string; url: string; protocol: string }) => boolean);
    globalGroup?: boolean;
  }
  
  export default function markedKatex(options?: KatexOptions): MarkedExtension;
}

declare module "turndown" {
  interface Options {
    headingStyle?: "setext" | "atx";
    hr?: string;
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    fence?: "```" | "~~~";
    emDelimiter?: "_" | "*";
    strongDelimiter?: "__" | "**";
    linkStyle?: "inlined" | "referenced";
    linkReferenceStyle?: "full" | "collapsed" | "shortcut";
    preformattedCode?: boolean;
  }

  interface Rule {
    filter: string | string[] | ((node: Node, options: Options) => boolean);
    replacement: (
      content: string,
      node: Node,
      options: Options
    ) => string;
  }

  class TurndownService {
    constructor(options?: Options);
    turndown(html: string | Node): string;
    addRule(key: string, rule: Rule): this;
    use(plugins: ((service: TurndownService) => void) | ((service: TurndownService) => void)[]): this;
    keep(filter: string | string[] | ((node: Node) => boolean)): this;
    remove(filter: string | string[] | ((node: Node) => boolean)): this;
    escape(text: string): string;
  }

  export default TurndownService;
}
