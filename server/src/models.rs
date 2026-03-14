use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserSummary,
    pub user_id: String,
    pub workspaces: Vec<WorkspaceSummary>,
}

#[derive(Debug, Serialize)]
pub struct UserSummary {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
}

// ── Organization ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateOrgRequest {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct OrgSummary {
    pub id: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct OrgDetail {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub members: Vec<OrgMemberInfo>,
}

#[derive(Debug, Serialize)]
pub struct OrgMemberInfo {
    pub user_id: String,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct AddOrgMemberRequest {
    pub email: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOrgRequest {
    pub name: Option<String>,
}

// ── Project ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub description: String,
}

// ── Task ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<String>,
    pub due_date: Option<i64>,
    pub start_date: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<Option<String>>,
    pub due_date: Option<Option<i64>>,
    pub start_date: Option<Option<i64>>,
    pub position: Option<f64>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct TaskDetail {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub assignee_id: Option<String>,
    pub due_date: Option<i64>,
    pub start_date: Option<i64>,
    pub position: f64,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub labels: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee_id: Option<String>,
    pub due_date: Option<i64>,
    pub position: f64,
}

// ── Annotation ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateAnnotationRequest {
    pub doc_path: String,
    pub range_start: i64,
    pub range_end: i64,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct AnnotationDetail {
    pub id: String,
    pub doc_path: String,
    pub user_id: String,
    pub range_start: i64,
    pub range_end: i64,
    pub content: String,
    pub resolved: bool,
    pub created_at: i64,
    pub replies: Vec<AnnotationReplyDetail>,
}

#[derive(Debug, Serialize)]
pub struct AnnotationReplyDetail {
    pub id: String,
    pub user_id: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnotationReplyRequest {
    pub content: String,
}

// ── Notification ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct NotificationSummary {
    pub id: String,
    pub org_id: String,
    #[serde(rename = "type")]
    pub ntype: String,
    pub title: String,
    pub body: String,
    pub ref_id: String,
    pub read: bool,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct MarkNotificationReadRequest {
    pub notification_ids: Vec<String>,
}

// ── Document Registry ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ResolveDocRequest {
    pub rel_path: String,
}

#[derive(Debug, Serialize)]
pub struct ResolveDocResponse {
    pub doc_id: String,
}

// ── Publish ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PublishStatusResponse {
    pub published: bool,
    pub url: Option<String>,
    pub published_at: Option<i64>,
    pub updated_at: Option<i64>,
}
