// ===== Constants =====

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type OrgRole = "admin" | "member" | "guest";

// ===== Organization =====

export interface OrgSummary {
  id: string;
  name: string;
  role: string; // OrgRole
}

export interface OrgDetail {
  id: string;
  name: string;
  owner_id: string;
  members: OrgMemberInfo[];
}

export interface OrgMemberInfo {
  user_id: string;
  email: string;
  role: string; // OrgRole
}

export interface CreateOrgRequest {
  name: string;
}

export interface AddOrgMemberRequest {
  email: string;
  role: string; // OrgRole
}

export interface UpdateOrgRequest {
  name?: string;
}

// ===== Project =====

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

// ===== Task =====

export interface TaskDetail {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string; // TaskStatus
  priority: string; // TaskPriority
  assignee_id: string | null;
  due_date: number | null;
  start_date: number | null;
  position: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  labels: string[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string; // TaskStatus
  priority: string; // TaskPriority
  assignee_id: string | null;
  due_date: number | null;
  position: number;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: string; // TaskStatus
  priority?: string; // TaskPriority
  assignee_id?: string;
  due_date?: number;
  start_date?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: string; // TaskStatus
  priority?: string; // TaskPriority
  assignee_id?: string | null;
  due_date?: number | null;
  start_date?: number | null;
  position?: number;
}

// ===== Annotation =====

export interface AnnotationDetail {
  id: string;
  doc_path: string;
  user_id: string;
  range_start: number;
  range_end: number;
  content: string;
  resolved: boolean;
  created_at: number;
  replies: AnnotationReplyDetail[];
}

export interface AnnotationReplyDetail {
  id: string;
  user_id: string;
  content: string;
  created_at: number;
}

export interface CreateAnnotationRequest {
  doc_path: string;
  range_start: number;
  range_end: number;
  content: string;
}

export interface CreateAnnotationReplyRequest {
  content: string;
}

// ===== Document Registry =====

export interface ResolveDocResponse {
  doc_id: string;
}

// ===== Notification =====

export interface NotificationSummary {
  id: string;
  org_id: string;
  type: string;
  title: string;
  body: string;
  ref_id: string;
  read: boolean;
  created_at: number;
}

export interface MarkNotificationReadRequest {
  notification_ids: string[];
}
