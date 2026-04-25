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
