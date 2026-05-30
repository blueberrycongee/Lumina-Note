# External File Change Sync Goal

## Context

Lumina-Note is used in workspaces where another process can change files while
the app is open. Common examples include an external AI agent editing notes,
Git operations replacing files, a shell command deleting files, or another app
renaming folders.

The current behavior is not reliable enough for that workflow. Users can see
stale open tabs, stale sidebar entries, or weak feedback when a file disappears
from disk.

## Current Findings

Confirmed in the current implementation:

- `electron/main/handlers/watcher.ts` emits `fs:change` payloads with lowercase
  event types: `create`, `modify`, and `remove`.
- `src/lib/fsChange.ts` expects older Tauri-style payload types:
  `Created`, `Modified`, `Deleted`, and `Renamed`.
- The main watcher uses `depth: 0`, so nested workspace changes are not covered
  by the root watcher.
- `src/App.tsx` refreshes the full file tree after a watcher event, then calls
  `reloadFileIfOpen(..., { skipIfDirty: true })`.
- `src/stores/useFileStore.ts` reloads clean open files by reading from disk,
  but deleted files only surface as a read error. Open tabs are not marked as
  deleted on disk.
- There is no explicit save conflict model. A dirty editor can skip external
  reloads, but save does not verify that the on-disk file still matches the
  version that was originally loaded.

## VS Code Reference

VS Code's behavior is the reference model for this work:

- Workspace folders are watched recursively; files opened outside the workspace
  are watched separately.
- File watcher events are treated as invalidation signals, not as absolute
  truth. VS Code explicitly accounts for unreliable OS events.
- Clean text models reload on external updates.
- Dirty text models are never reloaded automatically.
- Deleted open files enter an orphan state, and VS Code validates delete events
  with an existence check before changing model state.
- Save uses previous file metadata such as `mtime` and `etag` to prevent dirty
  writes. If disk content changed since the model was loaded, save enters a
  conflict path instead of silently overwriting.
- Save conflict UI offers compare, overwrite, and revert/discard paths.
- Explorer batches file events and refreshes only when the visible tree is
  affected.

Reference sources:

- https://github.com/microsoft/vscode/wiki/File-Watcher-Issues
- https://github.com/microsoft/vscode/blob/5b0f4fc7ed8b25641763ada5c5b50067957a002f/src/vs/workbench/services/textfile/common/textFileEditorModelManager.ts
- https://github.com/microsoft/vscode/blob/5b0f4fc7ed8b25641763ada5c5b50067957a002f/src/vs/workbench/services/textfile/common/textFileEditorModel.ts
- https://github.com/microsoft/vscode/blob/5b0f4fc7ed8b25641763ada5c5b50067957a002f/src/vs/workbench/contrib/files/browser/editors/textFileSaveErrorHandler.ts
- https://github.com/microsoft/vscode/blob/5b0f4fc7ed8b25641763ada5c5b50067957a002f/src/vs/workbench/contrib/files/browser/explorerService.ts

## Product Goal

External file changes should be reflected promptly without risking user edits.

Target behavior:

- A clean open tab automatically reloads after an external file modification.
- A dirty open tab is never overwritten by external changes.
- A dirty open tab whose disk file changed enters an explicit conflict state.
- An open tab whose disk file was deleted enters an explicit deleted-on-disk
  state while preserving any in-memory contents.
- The sidebar updates for external create, modify, delete, and rename/move
  operations, including nested files.
- Save refuses to silently overwrite newer disk content unless the user chooses
  an explicit overwrite path.
- Watcher failure or degradation is visible to the user and does not fail
  silently.

## Non-Goals

- Do not build real-time collaborative editing.
- Do not implement full three-way merge in this step.
- Do not support every network filesystem edge case perfectly.
- Do not add heavyweight background indexing just for change detection.
- Do not redesign the file tree UI beyond the minimal states needed to prevent
  stale or destructive behavior.

## Implementation Plan

1. Normalize file change events.
   - Define one renderer-facing event shape for create, modify, delete, and
     rename/move-like changes.
   - Keep backward compatibility with existing Tauri-style payloads where cheap.
   - Include enough metadata for path, old path, directory flag, and event kind.

2. Improve watcher coverage.
   - Change workspace watching from shallow to recursive.
   - Keep ignore rules aligned with file listing.
   - Keep polling fallback for `EMFILE` and `ENOSPC`.
   - Avoid duplicate watcher creation for the same vault.

3. Reconcile changed files and parent directories.
   - Treat watcher events as invalidation signals.
   - Refresh affected tree state after event batching.
   - Avoid overwriting dirty editor buffers.

4. Add open-tab disk state.
   - Track whether a tab is current, dirty, modified on disk, deleted on disk,
     or in save conflict.
   - For clean tabs, reload content when disk content changes.
   - For dirty tabs, preserve content and mark the tab as needing user action.

5. Add save conflict protection.
   - Track last loaded/saved file metadata.
   - Pass expected metadata on save.
   - If disk metadata no longer matches, refuse normal save and mark conflict.
   - Add an explicit overwrite operation for intentional replacement.

6. Surface minimal UI feedback.
   - Show tab-level indicators or tooltips for modified/deleted/conflict states.
   - Report actionable watcher degradation.
   - Keep the UI compact and consistent with existing tab bar patterns.

7. Verify.
   - Unit test event normalization.
   - Unit test clean reload, dirty skip, deleted-on-disk state, and conflict
     save protection.
   - Unit test watcher event emission shape.
   - Run focused test files first, then broader typecheck/test commands as
     needed.

## Acceptance Criteria

- External modification to a clean open Markdown file updates the tab content.
- External modification to a dirty open Markdown file does not replace the
  user's buffer and marks the tab as externally changed.
- External deletion of an open clean file marks the tab as deleted on disk and
  refreshes the sidebar.
- External deletion of an open dirty file preserves the dirty buffer and marks
  the tab as deleted on disk.
- Saving a dirty tab whose disk file changed since load does not silently
  overwrite the external change.
- The user can intentionally overwrite after a save conflict.
- Nested file creates, modifies, and deletes under the vault root emit change
  events.
- Existing file listing ignore behavior remains aligned with watcher ignore
  behavior.

## Risks

- Recursive watching can increase file descriptor pressure in large workspaces.
  The implementation must preserve ignore rules and degraded watcher feedback.
- Save conflict metadata based on mtime/size can miss rare same-size same-mtime
  changes. This is acceptable for the first implementation, but the design
  should allow content hashing later if needed.
- Existing dirty worktree changes in UI files must not be overwritten while this
  work is implemented.

