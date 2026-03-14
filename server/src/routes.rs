use axum::extract::{Json, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde::Deserialize;
use serde_json::json;

use crate::auth::{create_token, decode_token, hash_password, verify_password};
use crate::db;
use crate::error::AppError;
use crate::models::{
    AddOrgMemberRequest, AnnotationDetail, AnnotationReplyDetail, AuthResponse,
    CreateAnnotationReplyRequest, CreateAnnotationRequest, CreateOrgRequest, CreateProjectRequest,
    CreateTaskRequest, CreateWorkspaceRequest, LoginRequest, MarkNotificationReadRequest,
    NotificationSummary, OrgDetail, OrgMemberInfo, OrgSummary, ProjectSummary, RegisterRequest,
    TaskSummary, TokenResponse, UpdateOrgRequest, UpdateTaskRequest, UserSummary, WorkspaceSummary,
};
use crate::state::AppState;

// ── Existing routes ─────────────────────────────────────────────────

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

pub async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    (StatusCode::OK, Json(state.metrics.snapshot()))
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let email = payload.email.trim().to_lowercase();
    let password = payload.password.trim().to_string();
    if email.is_empty() || password.len() < 6 {
        return Err(AppError::BadRequest(
            "invalid email or password".to_string(),
        ));
    }

    let hash = hash_password(&password)?;
    let user_id = db::create_user(&state.pool, &email, &hash).await?;
    let _workspace_id = db::create_workspace(&state.pool, &user_id, "My Workspace").await?;
    let token = create_token(&user_id, &state.config)?;
    let workspaces = build_workspaces(&state, &user_id).await?;

    Ok(Json(AuthResponse {
        token,
        user: UserSummary {
            id: user_id.clone(),
            email: email.clone(),
        },
        user_id,
        workspaces,
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let email = payload.email.trim().to_lowercase();
    let password = payload.password.trim().to_string();
    if email.is_empty() || password.is_empty() {
        return Err(AppError::BadRequest(
            "invalid email or password".to_string(),
        ));
    }

    let user = db::find_user_by_email(&state.pool, &email).await?;
    let (user_id, password_hash) = user.ok_or(AppError::Unauthorized)?;
    if !verify_password(&password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let token = create_token(&user_id, &state.config)?;
    let workspaces = build_workspaces(&state, &user_id).await?;
    Ok(Json(AuthResponse {
        token,
        user: UserSummary {
            id: user_id.clone(),
            email: email.clone(),
        },
        user_id,
        workspaces,
    }))
}

pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TokenResponse>, AppError> {
    let token = extract_bearer(&headers).ok_or(AppError::Unauthorized)?;
    let claims = decode_token(&token, &state.config)?;
    let new_token = create_token(&claims.sub, &state.config)?;
    Ok(Json(TokenResponse { token: new_token }))
}

pub async fn list_workspaces(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<WorkspaceSummary>>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let workspaces = build_workspaces(&state, &user_id).await?;
    Ok(Json(workspaces))
}

pub async fn create_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWorkspaceRequest>,
) -> Result<Json<WorkspaceSummary>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest(
            "workspace name is required".to_string(),
        ));
    }
    let workspace_id = db::create_workspace(&state.pool, &user_id, name).await?;
    Ok(Json(WorkspaceSummary {
        id: workspace_id,
        name: name.to_string(),
    }))
}

// ── Helper functions ────────────────────────────────────────────────

async fn build_workspaces(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<WorkspaceSummary>, AppError> {
    let workspaces = db::list_workspaces(&state.pool, user_id).await?;
    Ok(workspaces
        .into_iter()
        .map(|(id, name)| WorkspaceSummary { id, name })
        .collect())
}

async fn require_user(state: &AppState, headers: &HeaderMap) -> Result<String, AppError> {
    let token = extract_bearer(headers).ok_or(AppError::Unauthorized)?;
    let claims = decode_token(&token, &state.config)?;
    Ok(claims.sub)
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let header = headers.get(axum::http::header::AUTHORIZATION)?;
    let value = header.to_str().ok()?;
    value
        .strip_prefix("Bearer ")
        .map(|token| token.trim().to_string())
}

/// Verify the user is authenticated and has one of the allowed roles in the org.
async fn require_org_role(
    state: &AppState,
    headers: &HeaderMap,
    org_id: &str,
    allowed_roles: &[&str],
) -> Result<String, AppError> {
    let user_id = require_user(state, headers).await?;
    let role = db::get_org_member_role(&state.pool, org_id, &user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    if !allowed_roles.contains(&role.as_str()) {
        return Err(AppError::Forbidden);
    }
    Ok(user_id)
}

/// Verify the user is authenticated and is any member of the org.
async fn require_org_member(
    state: &AppState,
    headers: &HeaderMap,
    org_id: &str,
) -> Result<String, AppError> {
    require_org_role(state, headers, org_id, &["admin", "member", "guest"]).await
}

// ── Organization routes ─────────────────────────────────────────────

pub async fn create_org(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateOrgRequest>,
) -> Result<Json<OrgSummary>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("org name is required".to_string()));
    }
    let org_id = db::create_organization(&state.pool, &user_id, name).await?;
    Ok(Json(OrgSummary {
        id: org_id,
        name: name.to_string(),
        role: "admin".to_string(),
    }))
}

pub async fn list_orgs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<OrgSummary>>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let orgs = db::list_user_organizations(&state.pool, &user_id).await?;
    Ok(Json(
        orgs.into_iter()
            .map(|(id, name, role)| OrgSummary { id, name, role })
            .collect(),
    ))
}

pub async fn get_org(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<OrgDetail>, AppError> {
    let _user_id = require_org_member(&state, &headers, &org_id).await?;
    let org = db::get_organization(&state.pool, &org_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let members = db::list_org_members(&state.pool, &org_id).await?;
    Ok(Json(OrgDetail {
        id: org.0,
        name: org.1,
        owner_id: org.2,
        members: members
            .into_iter()
            .map(|(user_id, email, role)| OrgMemberInfo {
                user_id,
                email,
                role,
            })
            .collect(),
    }))
}

pub async fn update_org(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateOrgRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _user_id = require_org_role(&state, &headers, &org_id, &["admin"]).await?;
    if let Some(ref name) = payload.name {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::BadRequest("org name is required".to_string()));
        }
        db::update_organization_name(&state.pool, &org_id, name).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn add_member(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<AddOrgMemberRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let _user_id = require_org_role(&state, &headers, &org_id, &["admin"]).await?;
    let email = payload.email.trim().to_lowercase();
    let role = payload.role.trim().to_string();
    if !["admin", "member", "guest"].contains(&role.as_str()) {
        return Err(AppError::BadRequest("invalid role".to_string()));
    }
    // Look up user by email
    let target_user = db::find_user_by_email(&state.pool, &email)
        .await?
        .ok_or(AppError::NotFound)?;
    let target_user_id = target_user.0;
    db::add_org_member(&state.pool, &org_id, &target_user_id, &role).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove_member(
    State(state): State<AppState>,
    Path((org_id, user_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let _admin_id = require_org_role(&state, &headers, &org_id, &["admin"]).await?;
    db::remove_org_member(&state.pool, &org_id, &user_id).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Project routes ──────────────────────────────────────────────────

pub async fn create_project(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateProjectRequest>,
) -> Result<Json<ProjectSummary>, AppError> {
    let _user_id = require_org_role(&state, &headers, &org_id, &["admin", "member"]).await?;
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("project name is required".to_string()));
    }
    let description = payload.description.as_deref().unwrap_or("").trim();
    let project_id = db::create_project(&state.pool, &org_id, name, description).await?;
    Ok(Json(ProjectSummary {
        id: project_id,
        name: name.to_string(),
        description: description.to_string(),
    }))
}

pub async fn list_org_projects(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<ProjectSummary>>, AppError> {
    let _user_id = require_org_member(&state, &headers, &org_id).await?;
    let projects = db::list_projects(&state.pool, &org_id).await?;
    Ok(Json(
        projects
            .into_iter()
            .map(|(id, name, description)| ProjectSummary {
                id,
                name,
                description,
            })
            .collect(),
    ))
}

// ── Task routes ─────────────────────────────────────────────────────

/// Helper: get project and verify user is an org member.
async fn require_project_member(
    state: &AppState,
    headers: &HeaderMap,
    project_id: &str,
) -> Result<(String, String), AppError> {
    let project = db::get_project(&state.pool, project_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let org_id = project.1; // (id, org_id, name, description)
    let user_id = require_org_member(state, headers, &org_id).await?;
    Ok((user_id, org_id))
}

pub async fn create_task(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateTaskRequest>,
) -> Result<Json<TaskSummary>, AppError> {
    let (user_id, _org_id) = require_project_member(&state, &headers, &project_id).await?;
    let title = payload.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("task title is required".to_string()));
    }
    let description = payload.description.as_deref().unwrap_or("");
    let status = payload.status.as_deref().unwrap_or("todo");
    let priority = payload.priority.as_deref().unwrap_or("medium");

    let task_id = db::create_task(
        &state.pool,
        &project_id,
        title,
        description,
        status,
        priority,
        payload.assignee_id.as_deref(),
        payload.due_date,
        payload.start_date,
        &user_id,
    )
    .await?;

    Ok(Json(TaskSummary {
        id: task_id,
        title: title.to_string(),
        status: status.to_string(),
        priority: priority.to_string(),
        assignee_id: payload.assignee_id,
        due_date: payload.due_date,
        position: 0.0,
    }))
}

pub async fn list_project_tasks(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<TaskSummary>>, AppError> {
    let (_user_id, _org_id) = require_project_member(&state, &headers, &project_id).await?;
    let tasks = db::list_tasks(&state.pool, &project_id).await?;
    Ok(Json(
        tasks
            .into_iter()
            .map(|t| TaskSummary {
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignee_id: t.assignee_id,
                due_date: t.due_date,
                position: t.position,
            })
            .collect(),
    ))
}

pub async fn update_task_handler(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateTaskRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify via task -> project -> org membership
    let task = db::get_task(&state.pool, &task_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let _user_and_org = require_project_member(&state, &headers, &task.project_id).await?;

    db::update_task(
        &state.pool,
        &task_id,
        payload.title.as_deref(),
        payload.description.as_deref(),
        payload.status.as_deref(),
        payload.priority.as_deref(),
        payload.assignee_id.as_ref().map(|o| o.as_deref()),
        payload.due_date,
        payload.start_date,
        payload.position,
    )
    .await?;

    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_task_handler(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let task = db::get_task(&state.pool, &task_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let _user_and_org = require_project_member(&state, &headers, &task.project_id).await?;
    db::delete_task(&state.pool, &task_id).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Annotation routes ───────────────────────────────────────────────

pub async fn create_annotation_handler(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateAnnotationRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_org_member(&state, &headers, &org_id).await?;
    if payload.content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "annotation content is required".to_string(),
        ));
    }
    let annotation_id = db::create_annotation(
        &state.pool,
        &payload.doc_path,
        &org_id,
        &user_id,
        payload.range_start,
        payload.range_end,
        &payload.content,
    )
    .await?;
    Ok(Json(json!({ "id": annotation_id })))
}

#[derive(Deserialize)]
pub struct AnnotationQuery {
    pub doc_path: String,
}

pub async fn list_annotations_handler(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<AnnotationQuery>,
) -> Result<Json<Vec<AnnotationDetail>>, AppError> {
    let _user_id = require_org_member(&state, &headers, &org_id).await?;
    let annotations = db::list_annotations(&state.pool, &query.doc_path, &org_id).await?;

    let mut result = Vec::with_capacity(annotations.len());
    for ann in annotations {
        let replies = db::list_annotation_replies(&state.pool, &ann.id).await?;
        result.push(AnnotationDetail {
            id: ann.id,
            doc_path: ann.doc_path,
            user_id: ann.user_id,
            range_start: ann.range_start,
            range_end: ann.range_end,
            content: ann.content,
            resolved: ann.resolved,
            created_at: ann.created_at,
            replies: replies
                .into_iter()
                .map(|(id, user_id, content, created_at)| AnnotationReplyDetail {
                    id,
                    user_id,
                    content,
                    created_at,
                })
                .collect(),
        });
    }
    Ok(Json(result))
}

pub async fn create_reply(
    State(state): State<AppState>,
    Path(annotation_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateAnnotationReplyRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify via annotation -> org membership
    let annotation = db::get_annotation(&state.pool, &annotation_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let user_id = require_org_member(&state, &headers, &annotation.org_id).await?;
    if payload.content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "reply content is required".to_string(),
        ));
    }
    let reply_id =
        db::create_annotation_reply(&state.pool, &annotation_id, &user_id, &payload.content)
            .await?;
    Ok(Json(json!({ "id": reply_id })))
}

pub async fn resolve_annotation_handler(
    State(state): State<AppState>,
    Path(annotation_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let annotation = db::get_annotation(&state.pool, &annotation_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let _user_id = require_org_member(&state, &headers, &annotation.org_id).await?;
    db::resolve_annotation(&state.pool, &annotation_id).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Notification routes ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct NotificationListQuery {
    pub limit: Option<i64>,
}

pub async fn list_notifications_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NotificationListQuery>,
) -> Result<Json<Vec<NotificationSummary>>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let limit = query.limit.unwrap_or(50);
    let notifications = db::list_notifications(&state.pool, &user_id, limit).await?;
    Ok(Json(
        notifications
            .into_iter()
            .map(|n| NotificationSummary {
                id: n.id,
                org_id: n.org_id,
                ntype: n.ntype,
                title: n.title,
                body: n.body,
                ref_id: n.ref_id,
                read: n.read,
                created_at: n.created_at,
            })
            .collect(),
    ))
}

pub async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MarkNotificationReadRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    for id in &payload.notification_ids {
        db::mark_notification_read(&state.pool, id, &user_id).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn mark_all_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    db::mark_all_notifications_read(&state.pool, &user_id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn unread_count(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = require_user(&state, &headers).await?;
    let count = db::count_unread_notifications(&state.pool, &user_id).await?;
    Ok(Json(json!({ "count": count })))
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::db;
    use crate::collab::CollabHub;
    use crate::state::{RelayHub, ServerMetrics};
    use axum::http::{header::AUTHORIZATION, HeaderValue};
    use sqlx::sqlite::SqlitePoolOptions;
    use std::sync::Arc;
    async fn test_state() -> AppState {
        let data_dir = std::env::temp_dir().join(format!("lumina-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&data_dir).unwrap();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        db::init_db(&pool).await.unwrap();

        AppState {
            pool,
            config: Config {
                bind: "127.0.0.1:0".to_string(),
                db_url: "sqlite::memory:".to_string(),
                data_dir: data_dir.display().to_string(),
                jwt_secret: "test-secret".to_string(),
            },
            relay: RelayHub::new(),
            collab: CollabHub::new(),
            metrics: Arc::new(ServerMetrics::new()),
        }
    }

    fn auth_headers(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn register_returns_user_and_default_workspace() {
        let state = test_state().await;

        let response = register(
            State(state),
            Json(RegisterRequest {
                email: "dev@example.com".to_string(),
                password: "change-me".to_string(),
            }),
        )
        .await
        .unwrap()
        .0;

        assert_eq!(response.user.email, "dev@example.com");
        assert!(!response.token.is_empty());
        assert_eq!(response.workspaces.len(), 1);
        assert_eq!(response.workspaces[0].name, "My Workspace");
    }

    #[tokio::test]
    async fn login_and_create_workspace_share_same_contract() {
        let state = test_state().await;

        let registered = register(
            State(state.clone()),
            Json(RegisterRequest {
                email: "dev@example.com".to_string(),
                password: "change-me".to_string(),
            }),
        )
        .await
        .unwrap()
        .0;

        let login_response = login(
            State(state.clone()),
            Json(LoginRequest {
                email: "dev@example.com".to_string(),
                password: "change-me".to_string(),
            }),
        )
        .await
        .unwrap()
        .0;

        assert_eq!(login_response.user.id, registered.user.id);
        assert_eq!(login_response.user.email, "dev@example.com");

        let created = create_workspace(
            State(state.clone()),
            auth_headers(&login_response.token),
            Json(CreateWorkspaceRequest {
                name: "Research".to_string(),
            }),
        )
        .await
        .unwrap()
        .0;

        assert_eq!(created.name, "Research");

        let listed = list_workspaces(State(state), auth_headers(&login_response.token))
            .await
            .unwrap()
            .0;
        assert_eq!(listed.len(), 2);
    }
}
