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

Pick the `provider` parameter based on what the request is *for*:

| Use this provider | When the request is… |
|---|---|
| `google-image` (Nano Banana — default) | General-purpose, iterating with reference images, anything where consistency across multiple frames matters. **Use this unless one of the rows below applies.** |
| `bytedance-image` (Seedream 4.5) | The image needs to render Chinese text, dense typography, or poster-style layouts. Seedream's text rendering is the strongest of the three. |
| `openai-image` (gpt-image-2) | Photorealism is essential, OR the user is composing 4+ reference images into one scene (Nano Banana caps at 3), OR the user explicitly asks for "OpenAI / DALL-E / GPT". |

When the user doesn't specify, **don't pick eagerly** — Nano Banana is fine for almost everything. Switch only when the request hits one of the specific rows above.

---

## Reference images

The user's existing notes/assets are often the best reference material — especially when they say things like "match the style of X" or "I made one like this before."

**Workflow when references are likely useful:**

1. Use `glob` to find image files in the vault: `**/*.png`, `**/*.jpg`, scope with a relevant subdirectory if the user named one.
2. Use `grep` to find notes mentioning the subject the user described — image embeds in those notes are strong candidates.
3. Use `read` to look at the candidate images (you can see them — they're real multimodal input) and pick the 1–3 that match the user's intent.
4. Pass the absolute paths in `reference_images`.

**Cap at 3 references.** Nano Banana stops paying attention beyond that, and gpt-image-2 / Seedream don't gain much either. If you have more candidates, pick the most recent + most stylistically aligned.

**Don't fabricate paths.** If you can't find a real reference file matching the user's description, ask them to point you at one or proceed without references.

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

The tool returns the vault-relative path. **Always include the markdown image syntax in your reply** so the user can drop the image into a note immediately:

```markdown
![alt text](assets/generated/2026-04/260427-...-XXXX.png)
```

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
