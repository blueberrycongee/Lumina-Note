import { tauriFetchJson } from '@/lib/tauriFetch';
import type {
  CreateOrgRequest,
  OrgSummary,
  OrgDetail,
  UpdateOrgRequest,
  AddOrgMemberRequest,
  CreateProjectRequest,
  ProjectSummary,
  CreateTaskRequest,
  TaskDetail,
  UpdateTaskRequest,
  CreateAnnotationRequest,
  AnnotationDetail,
  CreateAnnotationReplyRequest,
  NotificationSummary,
  MarkNotificationReadRequest,
} from './types';

// ===== Helpers =====

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { code?: string; message?: string };
    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    return raw;
  }
  return raw;
}

async function postJson<T>(url: string, body: unknown, token: string): Promise<T> {
  const response = await tauriFetchJson<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.data) {
    throw new Error(parseErrorMessage(response.error || 'Request failed'));
  }
  return response.data;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await tauriFetchJson<T>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok || !response.data) {
    throw new Error(parseErrorMessage(response.error || 'Request failed'));
  }
  return response.data;
}

async function putJson<T>(url: string, body: unknown, token: string): Promise<T> {
  const response = await tauriFetchJson<T>(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.data) {
    throw new Error(parseErrorMessage(response.error || 'Request failed'));
  }
  return response.data;
}

async function deleteJson(url: string, token: string): Promise<void> {
  const response = await tauriFetchJson<unknown>(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(parseErrorMessage(response.error || 'Request failed'));
  }
}

// ===== Organizations =====

export async function createOrg(
  baseUrl: string,
  token: string,
  req: CreateOrgRequest
): Promise<OrgSummary> {
  const base = normalizeBaseUrl(baseUrl);
  return postJson<OrgSummary>(`${base}/orgs`, req, token);
}

export async function listOrgs(baseUrl: string, token: string): Promise<OrgSummary[]> {
  const base = normalizeBaseUrl(baseUrl);
  return getJson<OrgSummary[]>(`${base}/orgs`, token);
}

export async function getOrg(baseUrl: string, token: string, orgId: string): Promise<OrgDetail> {
  const base = normalizeBaseUrl(baseUrl);
  return getJson<OrgDetail>(`${base}/orgs/${orgId}`, token);
}

export async function updateOrg(
  baseUrl: string,
  token: string,
  orgId: string,
  req: UpdateOrgRequest
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await putJson<void>(`${base}/orgs/${orgId}`, req, token);
}

export async function addOrgMember(
  baseUrl: string,
  token: string,
  orgId: string,
  req: AddOrgMemberRequest
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await postJson<void>(`${base}/orgs/${orgId}/members`, req, token);
}

export async function removeOrgMember(
  baseUrl: string,
  token: string,
  orgId: string,
  userId: string
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await deleteJson(`${base}/orgs/${orgId}/members/${userId}`, token);
}

// ===== Projects =====

export async function createProject(
  baseUrl: string,
  token: string,
  orgId: string,
  req: CreateProjectRequest
): Promise<ProjectSummary> {
  const base = normalizeBaseUrl(baseUrl);
  return postJson<ProjectSummary>(`${base}/orgs/${orgId}/projects`, req, token);
}

export async function listProjects(
  baseUrl: string,
  token: string,
  orgId: string
): Promise<ProjectSummary[]> {
  const base = normalizeBaseUrl(baseUrl);
  return getJson<ProjectSummary[]>(`${base}/orgs/${orgId}/projects`, token);
}

// ===== Tasks =====

export async function createTask(
  baseUrl: string,
  token: string,
  projectId: string,
  req: CreateTaskRequest
): Promise<TaskDetail> {
  const base = normalizeBaseUrl(baseUrl);
  return postJson<TaskDetail>(`${base}/projects/${projectId}/tasks`, req, token);
}

export async function listTasks(
  baseUrl: string,
  token: string,
  projectId: string
): Promise<TaskDetail[]> {
  const base = normalizeBaseUrl(baseUrl);
  return getJson<TaskDetail[]>(`${base}/projects/${projectId}/tasks`, token);
}

export async function updateTask(
  baseUrl: string,
  token: string,
  taskId: string,
  req: UpdateTaskRequest
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await putJson<void>(`${base}/tasks/${taskId}`, req, token);
}

export async function deleteTask(baseUrl: string, token: string, taskId: string): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await deleteJson(`${base}/tasks/${taskId}`, token);
}

// ===== Annotations =====

export async function createAnnotation(
  baseUrl: string,
  token: string,
  orgId: string,
  req: CreateAnnotationRequest
): Promise<AnnotationDetail> {
  const base = normalizeBaseUrl(baseUrl);
  return postJson<AnnotationDetail>(`${base}/orgs/${orgId}/annotations`, req, token);
}

export async function listAnnotations(
  baseUrl: string,
  token: string,
  orgId: string,
  docPath: string
): Promise<AnnotationDetail[]> {
  const base = normalizeBaseUrl(baseUrl);
  return getJson<AnnotationDetail[]>(
    `${base}/orgs/${orgId}/annotations?doc_path=${encodeURIComponent(docPath)}`,
    token
  );
}

export async function createAnnotationReply(
  baseUrl: string,
  token: string,
  annotationId: string,
  req: CreateAnnotationReplyRequest
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await postJson<void>(`${base}/annotations/${annotationId}/replies`, req, token);
}

export async function resolveAnnotation(
  baseUrl: string,
  token: string,
  annotationId: string
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await postJson<void>(`${base}/annotations/${annotationId}/resolve`, {}, token);
}

// ===== Notifications =====

export async function listNotifications(
  baseUrl: string,
  token: string,
  limit?: number
): Promise<NotificationSummary[]> {
  const base = normalizeBaseUrl(baseUrl);
  const query = limit !== undefined ? `?limit=${limit}` : '';
  return getJson<NotificationSummary[]>(`${base}/notifications${query}`, token);
}

export async function markNotificationsRead(
  baseUrl: string,
  token: string,
  req: MarkNotificationReadRequest
): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await postJson<void>(`${base}/notifications/read`, req, token);
}

export async function markAllNotificationsRead(baseUrl: string, token: string): Promise<void> {
  const base = normalizeBaseUrl(baseUrl);
  await postJson<void>(`${base}/notifications/read-all`, {}, token);
}

export async function getUnreadNotificationCount(baseUrl: string, token: string): Promise<number> {
  const base = normalizeBaseUrl(baseUrl);
  const result = await getJson<{ count: number }>(`${base}/notifications/unread-count`, token);
  return result.count;
}
