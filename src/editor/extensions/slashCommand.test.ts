import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { parser, Table } from "@lezer/markdown";
import { getDefaultCommands, type SlashCommand } from "./slashCommand";

const markdownParser = parser.configure([Table]);

function createView(text: string) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [markdown({ base: markdownLanguage, extensions: [Table] })],
    }),
    parent,
  });
  return {
    view,
    cleanup: () => {
      view.destroy();
      parent.remove();
    },
  };
}

function command(id: string, tableTemplate?: string): SlashCommand {
  const commands = getDefaultCommands({
    editor: {
      slashMenu: {
        commands: {
          tableTemplate,
        },
      },
    },
  } as any);
  const cmd = commands.find((item) => item.id === id);
  if (!cmd) throw new Error(`Missing command: ${id}`);
  return cmd;
}

function hasNode(text: string, nodeName: string): boolean {
  let found = false;
  markdownParser.parse(text).iterate({
    enter(node) {
      if (node.name === nodeName) found = true;
    },
  });
  return found;
}

describe("slash commands", () => {
  it("normalizes escaped localized table templates before inserting", () => {
    const { view, cleanup } = createView("/table");

    command(
      "table",
      "| Col 1 | Col 2 |\\n| --- | --- |\\n|  |  |",
    ).action(view, 0, "/table".length);

    const doc = view.state.doc.toString();
    expect(doc).toBe("| Col 1 | Col 2 |\n| --- | --- |\n|  |  |");
    expect(doc).not.toContain("\\n");
    expect(hasNode(doc, "Table")).toBe(true);
    cleanup();
  });

  it("inserts table commands as standalone blocks when used after text", () => {
    const initial = "Intro /table";
    const from = initial.indexOf("/");
    const { view, cleanup } = createView(initial);

    command("table", "| A | B |\n| --- | --- |\n| 1 | 2 |").action(
      view,
      from,
      initial.length,
    );

    const doc = view.state.doc.toString();
    expect(doc).toContain("Intro\n\n| A | B |");
    expect(hasNode(doc, "Table")).toBe(true);
    cleanup();
  });

  it("inserts block format commands as standalone blocks when used after text", () => {
    const initial = "Intro /divider";
    const from = initial.indexOf("/");
    const { view, cleanup } = createView(initial);

    command("divider").action(view, from, initial.length);

    const doc = view.state.doc.toString();
    expect(doc).toBe("Intro\n\n---\n");
    expect(hasNode(doc, "HorizontalRule")).toBe(true);
    cleanup();
  });

  it("keeps inline insert commands inline", () => {
    const initial = "Intro /link";
    const from = initial.indexOf("/");
    const { view, cleanup } = createView(initial);

    command("link").action(view, from, initial.length);

    expect(view.state.doc.toString()).toBe("Intro []()");
    expect(view.state.selection.main.anchor).toBe("Intro [".length);
    cleanup();
  });
});
