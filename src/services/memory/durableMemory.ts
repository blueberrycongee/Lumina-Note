import { invoke } from "@tauri-apps/api/core";
import type { AgentConfig, Message } from "@/stores/useRustAgentStore";

export type MemoryScope =
  | "session"
  | "user_identity"
  | "project"
  | "local_context"
  | "relationship"
  | "pattern"
  | "team_shared";

export type MemoryVisibility = "private" | "shared";

export type MemoryConfidence = "low" | "medium" | "high";

export type MemoryMergeAction =
  | "created"
  | "updated"
  | "deduped"
  | "skipped_low_confidence"
  | "skipped_empty"
  | "skipped_invalid_scope";

export interface MemorySourceRef {
  sessionId: string;
  extractedAt: number;
  sourceExcerpt: string | null;
}

export interface MemoryEntryVersion {
  version: number;
  summary: string;
  details: string;
  confidence: MemoryConfidence;
  updatedAt: number;
}

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  visibility: MemoryVisibility;
  title: string;
  summary: string;
  details: string;
  confidence: MemoryConfidence;
  tags: string[];
  filePath: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastVerifiedAt: number | null;
  sourceRefs: MemorySourceRef[];
  history: MemoryEntryVersion[];
}

export interface WikiPageSummary {
  id: string;
  title: string;
  path: string;
  entryIds: string[];
  staleEntryCount: number;
  updatedAt: number | null;
}

export interface MemoryMergeResult {
  action: MemoryMergeAction;
  entryId: string | null;
  scope: MemoryScope | null;
  title: string;
  path: string | null;
  detail: string;
}

export interface DurableMemorySnapshot {
  workspacePath: string;
  manifestPath: string;
  entries: MemoryEntry[];
  wikiRoot: string;
  wikiPages: WikiPageSummary[];
  staleEntryIds: string[];
  duplicateEntryIds: string[];
  conflictEntryIds: string[];
  mergeResults: MemoryMergeResult[];
  extractionInFlight: boolean;
  lastExtractedAt: number | null;
}

export interface DurableMemoryConfig {
  minimumMessagesToExtract: number;
  minimumTokensToExtract: number;
  maxTranscriptChars: number;
  maxManifestEntriesInPrompt: number;
  maxCandidates: number;
  minimumConfidenceToWrite: MemoryConfidence;
}

export interface MemoryEntryInput {
  id?: string;
  scope: Exclude<MemoryScope, "session">;
  visibility?: MemoryVisibility;
  title: string;
  summary: string;
  details: string;
  confidence?: MemoryConfidence;
  tags?: string[];
}

interface ExtractDurableMemoriesInput {
  workspacePath: string;
  sessionId: string;
  messages: Message[];
  config: AgentConfig;
  force?: boolean;
  durableMemoryConfig?: Partial<DurableMemoryConfig>;
}

interface BackendMemorySourceRef {
  session_id: string;
  extracted_at: number;
  source_excerpt?: string | null;
}

interface BackendMemoryEntryVersion {
  version: number;
  summary: string;
  details: string;
  confidence: MemoryConfidence;
  updated_at: number;
}

interface BackendMemoryEntry {
  id: string;
  scope: MemoryScope;
  visibility?: MemoryVisibility;
  title: string;
  summary: string;
  details: string;
  confidence: MemoryConfidence;
  tags: string[];
  file_path: string;
  version: number;
  created_at: number;
  updated_at: number;
  last_verified_at?: number | null;
  source_refs: BackendMemorySourceRef[];
  history: BackendMemoryEntryVersion[];
}

interface BackendWikiPageSummary {
  id: string;
  title: string;
  path: string;
  entry_ids: string[];
  stale_entry_count: number;
  updated_at?: number | null;
}

interface BackendMemoryMergeResult {
  action: MemoryMergeAction;
  entry_id?: string | null;
  scope?: MemoryScope | null;
  title: string;
  path?: string | null;
  detail: string;
}

interface BackendDurableMemorySnapshot {
  workspace_path: string;
  manifest_path: string;
  entries: BackendMemoryEntry[];
  wiki_root?: string;
  wiki_pages?: BackendWikiPageSummary[];
  stale_entry_ids?: string[];
  duplicate_entry_ids?: string[];
  conflict_entry_ids?: string[];
  merge_results: BackendMemoryMergeResult[];
  extraction_in_flight: boolean;
  last_extracted_at?: number | null;
}

interface BackendDurableMemoryConfig {
  minimum_messages_to_extract: number;
  minimum_tokens_to_extract: number;
  max_transcript_chars: number;
  max_manifest_entries_in_prompt: number;
  max_candidates: number;
  minimum_confidence_to_write: MemoryConfidence;
}

const DEFAULT_DURABLE_MEMORY_CONFIG: DurableMemoryConfig = {
  minimumMessagesToExtract: 6,
  minimumTokensToExtract: 1200,
  maxTranscriptChars: 20000,
  maxManifestEntriesInPrompt: 40,
  maxCandidates: 5,
  minimumConfidenceToWrite: "medium",
};

function toFrontendSourceRef(source: BackendMemorySourceRef): MemorySourceRef {
  return {
    sessionId: source.session_id,
    extractedAt: source.extracted_at,
    sourceExcerpt: source.source_excerpt ?? null,
  };
}

function toFrontendEntryVersion(
  version: BackendMemoryEntryVersion,
): MemoryEntryVersion {
  return {
    version: version.version,
    summary: version.summary,
    details: version.details,
    confidence: version.confidence,
    updatedAt: version.updated_at,
  };
}

function toFrontendEntry(entry: BackendMemoryEntry): MemoryEntry {
  return {
    id: entry.id,
    scope: entry.scope,
    visibility:
      entry.visibility ??
      (entry.scope === "team_shared" ? "shared" : "private"),
    title: entry.title,
    summary: entry.summary,
    details: entry.details,
    confidence: entry.confidence,
    tags: entry.tags,
    filePath: entry.file_path,
    version: entry.version,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    lastVerifiedAt: entry.last_verified_at ?? null,
    sourceRefs: entry.source_refs.map(toFrontendSourceRef),
    history: entry.history.map(toFrontendEntryVersion),
  };
}

function toFrontendWikiPage(page: BackendWikiPageSummary): WikiPageSummary {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    entryIds: page.entry_ids,
    staleEntryCount: page.stale_entry_count,
    updatedAt: page.updated_at ?? null,
  };
}

function toFrontendMergeResult(
  result: BackendMemoryMergeResult,
): MemoryMergeResult {
  return {
    action: result.action,
    entryId: result.entry_id ?? null,
    scope: result.scope ?? null,
    title: result.title,
    path: result.path ?? null,
    detail: result.detail,
  };
}

function toFrontendSnapshot(
  snapshot: BackendDurableMemorySnapshot,
): DurableMemorySnapshot {
  return {
    workspacePath: snapshot.workspace_path,
    manifestPath: snapshot.manifest_path,
    entries: snapshot.entries.map(toFrontendEntry),
    wikiRoot: snapshot.wiki_root ?? "",
    wikiPages: (snapshot.wiki_pages ?? []).map(toFrontendWikiPage),
    staleEntryIds: snapshot.stale_entry_ids ?? [],
    duplicateEntryIds: snapshot.duplicate_entry_ids ?? [],
    conflictEntryIds: snapshot.conflict_entry_ids ?? [],
    mergeResults: snapshot.merge_results.map(toFrontendMergeResult),
    extractionInFlight: snapshot.extraction_in_flight,
    lastExtractedAt: snapshot.last_extracted_at ?? null,
  };
}

function normalizeConfig(
  override?: Partial<DurableMemoryConfig>,
): DurableMemoryConfig {
  return {
    ...DEFAULT_DURABLE_MEMORY_CONFIG,
    ...override,
  };
}

function toBackendConfig(
  override?: Partial<DurableMemoryConfig>,
): BackendDurableMemoryConfig | undefined {
  if (!override) return undefined;
  const normalized = normalizeConfig(override);
  return {
    minimum_messages_to_extract: normalized.minimumMessagesToExtract,
    minimum_tokens_to_extract: normalized.minimumTokensToExtract,
    max_transcript_chars: normalized.maxTranscriptChars,
    max_manifest_entries_in_prompt: normalized.maxManifestEntriesInPrompt,
    max_candidates: normalized.maxCandidates,
    minimum_confidence_to_write: normalized.minimumConfidenceToWrite,
  };
}

async function invokeDurableMemory<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Durable memory command ${command} failed: ${message}`);
  }
}

export function hasDurableMemories(snapshot: DurableMemorySnapshot | null) {
  return Boolean(snapshot && snapshot.entries.length > 0);
}

export async function loadDurableMemorySnapshot(
  workspacePath: string,
): Promise<DurableMemorySnapshot | null> {
  if (!workspacePath) return null;
  const snapshot =
    await invokeDurableMemory<BackendDurableMemorySnapshot | null>(
      "agent_get_durable_memory_snapshot",
      { workspacePath },
    );
  if (!snapshot) return null;
  return toFrontendSnapshot(snapshot);
}

export async function extractDurableMemories(
  input: ExtractDurableMemoriesInput,
): Promise<DurableMemorySnapshot | null> {
  const { workspacePath, sessionId, messages, config, force } = input;
  if (!workspacePath || !sessionId || messages.length === 0) {
    return null;
  }

  const snapshot = await invokeDurableMemory<BackendDurableMemorySnapshot>(
    "agent_extract_durable_memories",
    {
      config,
      workspacePath,
      sessionId,
      messages: messages.map((message) => ({
        role: message.role,
        content: String(message.content ?? ""),
      })),
      force,
      durableMemoryConfig: toBackendConfig(input.durableMemoryConfig),
    },
  );

  return toFrontendSnapshot(snapshot);
}

export async function upsertDurableMemoryEntry(
  workspacePath: string,
  entry: MemoryEntryInput,
): Promise<DurableMemorySnapshot | null> {
  if (!workspacePath) return null;
  const snapshot = await invokeDurableMemory<BackendDurableMemorySnapshot>(
    "agent_upsert_durable_memory_entry",
    {
      workspacePath,
      entry: {
        ...entry,
        confidence: entry.confidence ?? "medium",
        tags: entry.tags ?? [],
      },
    },
  );
  return toFrontendSnapshot(snapshot);
}

export async function deleteDurableMemoryEntry(
  workspacePath: string,
  entryId: string,
): Promise<DurableMemorySnapshot | null> {
  if (!workspacePath || !entryId) return null;
  const snapshot = await invokeDurableMemory<BackendDurableMemorySnapshot>(
    "agent_delete_durable_memory_entry",
    {
      workspacePath,
      entryId,
    },
  );
  return toFrontendSnapshot(snapshot);
}

export async function reverifyDurableMemoryEntry(
  workspacePath: string,
  entryId: string,
): Promise<DurableMemorySnapshot | null> {
  if (!workspacePath || !entryId) return null;
  const snapshot = await invokeDurableMemory<BackendDurableMemorySnapshot>(
    "agent_reverify_durable_memory_entry",
    {
      workspacePath,
      entryId,
    },
  );
  return toFrontendSnapshot(snapshot);
}

export async function gcDurableMemory(
  workspacePath: string,
): Promise<DurableMemorySnapshot | null> {
  if (!workspacePath) return null;
  const snapshot = await invokeDurableMemory<BackendDurableMemorySnapshot>(
    "agent_gc_durable_memory",
    { workspacePath },
  );
  return toFrontendSnapshot(snapshot);
}
