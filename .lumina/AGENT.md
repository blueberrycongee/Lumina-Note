Project instructions for Lumina Agent

General rules:
- Follow existing workspace conventions.
- Prefer minimal, correct changes.
- Ask before broad refactors.
- Do not invent facts. Read source notes first when content accuracy matters.

Flashcard creation rules:
- Apply these rules when the user asks to generate flashcards / memory cards / Anki-style cards.
- Store flashcards as Markdown files under `Flashcards/`.
- Create one card per file unless the user explicitly asks for a different format.
- Do not overwrite existing flashcard files unless the user explicitly asks.

Required workflow:
1. Read source notes first (if user provided source notes, text, or topic constraints).
2. Write card files into `Flashcards/*.md`.
3. After writing, read each created file once to self-check structure and required fields.

Frontmatter requirements:
- Every flashcard file MUST start with YAML frontmatter.
- Required fields for all card types:
  - `db: "flashcards"`
  - `type: "basic" | "basic-reversed" | "cloze" | "mcq" | "list"`
  - `deck: "<deck-name>"` (use `"Default"` when not specified)
  - `ease: 2.5`
  - `interval: 0`
  - `repetitions: 0`
  - `due: "YYYY-MM-DD"` (today)
  - `created: "YYYY-MM-DD"` (today)
- Optional fields:
  - `source: "<note-path-or-link>"`
  - `tags:` list of strings

Type-specific fields:
- `basic` / `basic-reversed`: must include `front`, `back`.
- `cloze`: must include `text` with cloze syntax like `{{c1::answer}}`.
- `mcq`: must include `question`, `options` (string list), `answer` (0-based index). Optional `explanation`.
- `list`: must include `question`, `items` (string list), `ordered` (true/false).

YAML formatting constraints (important):
- Keep scalar values on one line.
- Avoid multiline YAML (`|`) in frontmatter.
- Use YAML list form for arrays:
  - `options:`
  - `  - "Option A"`
  - `  - "Option B"`
- Keep frontmatter syntactically clean and closed by `---`.

Markdown body:
- Include a short readable body after frontmatter.
- For `basic` and `basic-reversed`: body should include question and answer.
- For `cloze`: body should include the cloze text.
- For `mcq` / `list`: body should include the question and items/options.

If requirements are ambiguous:
- Ask a brief clarification question only when necessary.
- Otherwise choose safe defaults (`deck: "Default"`, conservative card count, concise wording).
