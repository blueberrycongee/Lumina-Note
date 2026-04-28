---
name: image-gen
description: Generate images for the user's vault — pick the right provider, gather reference images from notes when relevant, write the result to assets/generated/, and surface the markdown reference. Use this when the user asks for any picture, illustration, mood image, poster, or visual companion to a note.
---

# Image generation playbook

You have one image-generation tool: `generate_image`. It routes to one of three providers (gpt-image-2, Gemini Nano Banana, Seedream 4.5) and writes a PNG to `assets/generated/<YYYY-MM>/<id>.png` inside the vault, with a sidecar JSON capturing the prompt and references for reproducibility.

The tool is registered by Lumina's plugin. The provider's API key must already be configured in **AI Settings → Image Models** — surface that path in your error message if you hit a "no API key" error.

---

## When to invoke

Trigger on intent, not specific words. Plausible signals:

- Direct ask: "draw / generate / paint / create an image of …", "make me a picture of …".
- Note-illustration ask: "give this note a header image", "an icon for this section", "a cover for the chapter".
- Mood / inspiration ask: "what would X look like", "show me a vibe board for …", "imagine …".
- Continuation: "make it more …", "in the style of that other one" — usually means iterate on the most recent generated image.

**Don't invoke when:**

- The user's intent is a *diagram* (mermaid, sequence chart, flow). Use markdown / mermaid instead — generation models do diagrams badly.
- The user wants a real photograph of a real subject (a person, an event). Image gen is synthesis, not retrieval.
- The user's request is ambiguous and getting it wrong wastes their time. **Ask one clarifying question** instead of guessing.

---

## Provider routing

Pick the `provider` parameter based on what the request is *for* and what is configured. When Lumina tells you a configured provider in the user message wrapper, use only that provider unless Lumina explicitly lists another configured provider. Never switch to an unconfigured provider.

| Use this provider | When the request is… |
|---|---|
| `openai-image` (gpt-image-2) | Photorealism is essential, the user explicitly asks for OpenAI / DALL-E / GPT, or Lumina says OpenAI is the configured image provider. |
| `google-image` (Nano Banana) | General-purpose, iterating with reference images, anything where consistency across multiple frames matters, when Google image generation is configured. |
| `bytedance-image` (Seedream 4.5) | The image needs to render readable text, dense typography, or poster-style layouts, and Seedream is configured. The language the user typed in is not by itself a visible-text requirement. |

When the user doesn't specify, **don't invent a different provider**. Use the provider Lumina identified as configured in the wrapped prompt; otherwise omit `provider` and let Lumina route to the first configured image provider.

Preserve the user's explicit visual constraints. Medium, region, era,
genre, culture, composition, subject, mood, palette, and style descriptors are
part of the image request — do not replace them with a nearby default style
unless the user asked for that. Treat readable text separately: if the user
asks for visible text, preserve the requested text and language; otherwise
avoid readable text, letters, captions, labels, and speech bubbles.

---

## Reference images

Reference images are file paths. `generate_image` reads those files and sends their bytes to the image-generation provider; the chat model does not need vision capability for the references to affect generation.

Most requests do not need automatic reference search. Prefer explicit or high-confidence references:

- Images the user explicitly mentioned or attached.
- The previous generated image when the user is iterating ("more X", "less Y", "like that one").
- Images embedded in the active note when the user refers to the current note, cover, header, or visual style.
- Image files the user selected with `@` or named directly.

Only search for candidates when the user asks for an existing style/image without naming a specific file ("like my earlier cyberpunk cover", "match this project's visual style").

**Workflow when reference search is actually needed:**

1. Use `glob` to find image files in a narrow scope: current note folder first, then `assets/generated/**`, then user-named subdirectories.
2. Use `grep` to find notes, embeds, filenames, and sidecar metadata mentioning the subject/style the user described.
3. If your current model has vision capability, use `read` on a small candidate set and extract visual traits that improve the prompt: subject, composition, palette, lighting, material, style, typography, and framing.
4. If your current model does not have vision capability, do not use `read` to judge what images depict. Choose only from explicit references or textual evidence: filename, path, nearby note text, embeds, recency, and sidecar prompt/metadata.
5. Pass the selected absolute paths in `reference_images`.

**Cap at 3 references.** Nano Banana stops paying attention beyond that, and gpt-image-2 / Seedream don't gain much either. If you have more candidates, pick the explicit/high-confidence ones first.

**Don't fabricate paths or visual facts.** If you can't find a reliable reference file, ask the user to point you at one or proceed without references.

---

## Aspect ratio

Use `aspect_ratio` to match the use case:

- `16:9` — banners, hero images, desktop wallpapers, presentation slides
- `9:16` — mobile/vertical stories, posters
- `4:3` / `3:4` — when the user mentions photo / paper proportions
- `1:1` — default when nothing else fits, icons, avatars, square thumbnails

If the user doesn't say, **infer from context** — a "header image" is 16:9, an "icon" is 1:1, a "phone wallpaper" is 9:16.

---

## After generating

The tool returns the vault-relative path, and Lumina renders the generated
image in chat automatically. **Do not repeat the image as markdown in the
chat reply** unless the user explicitly asks for the markdown reference.
If useful, mention the saved vault-relative path in plain text.

If the user asked for the image to land in a specific note, **edit the note** to insert it (use the `edit` tool). Don't leave the image dangling — the whole point is integration with their vault.

If the user is iterating ("more X", "less Y"), pass the previous generation's absolute path back in `reference_images` so the next call carries the visual continuity.

---

## Errors and recovery

- **"No API key for provider X"** → tell the user to open **AI Settings → Image Models** and add a key for the provider you tried. Suggest a different provider if one of the others is configured.
- **"No vault open"** → tell the user to open a vault first. The tool can't write images without a destination.
- **Network / 5xx errors** → retry once with a different provider. Don't loop indefinitely.
- **Reference file not readable** → drop that reference and proceed; mention the skipped path in your reply so the user knows.

---

## Don't

- Don't generate the same image twice "to compare" — one generation is enough; if the user wants alternatives, ask before burning more API quota.
- Don't claim the image looks a certain way without actually reading it back. If you need to verify the result, use `read` on the saved file.
- Don't pad the prompt with adjectives the user didn't ask for. The user's words are the brief; your job is to faithfully translate, not embellish.
