use axum::extract::{Json, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde_json::json;

use crate::auth::{create_token, decode_token, hash_password, verify_password};
use crate::db;
use crate::error::AppError;
use crate::models::{
    AuthResponse, CreateWorkspaceRequest, LoginRequest, RegisterRequest, TokenResponse,
    WorkspaceSummary,
};
use crate::state::AppState;

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
