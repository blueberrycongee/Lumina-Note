use crate::error::AppError;
use chrono::Utc;
use sqlx::{SqlitePool, Row};
use uuid::Uuid;

pub async fn init_db(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create users table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create workspaces table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workspace_members (
            user_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, workspace_id)
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create workspace_members table: {}", e)))?;

    Ok(())
}

pub async fn create_user(pool: &SqlitePool, email: &str, password_hash: &str) -> Result<String, AppError> {
    let user_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let result = sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash, created_at)
        VALUES (?1, ?2, ?3, ?4);
        "#,
    )
    .bind(&user_id)
    .bind(email)
    .bind(password_hash)
    .bind(now)
    .execute(pool)
    .await;

    if let Err(err) = result {
        let message = err.to_string();
        if message.contains("UNIQUE") {
            return Err(AppError::Conflict("email already exists".to_string()));
        }
        return Err(AppError::Internal(format!("create user: {}", err)));
    }

    Ok(user_id)
}

pub async fn find_user_by_email(
    pool: &SqlitePool,
    email: &str,
) -> Result<Option<(String, String)>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, password_hash
        FROM users
        WHERE email = ?1;
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("query user: {}", e)))?;

    Ok(row.map(|row| (row.get::<String, _>("id"), row.get::<String, _>("password_hash"))))
}

pub async fn get_user_by_id(pool: &SqlitePool, user_id: &str) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT email
        FROM users
        WHERE id = ?1;
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("query user by id: {}", e)))?;

    Ok(row.map(|row| row.get::<String, _>("email")))
}

pub async fn create_workspace(
    pool: &SqlitePool,
    owner_id: &str,
    name: &str,
) -> Result<String, AppError> {
    let workspace_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO workspaces (id, name, owner_id, created_at)
        VALUES (?1, ?2, ?3, ?4);
        "#,
    )
    .bind(&workspace_id)
    .bind(name)
    .bind(owner_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create workspace: {}", e)))?;

    sqlx::query(
        r#"
        INSERT INTO workspace_members (user_id, workspace_id, role, created_at)
        VALUES (?1, ?2, 'owner', ?3);
        "#,
    )
    .bind(owner_id)
    .bind(&workspace_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("insert workspace member: {}", e)))?;

    Ok(workspace_id)
}

pub async fn list_workspaces(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Vec<(String, String)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT w.id, w.name
        FROM workspaces w
        JOIN workspace_members m
          ON w.id = m.workspace_id
        WHERE m.user_id = ?1
        ORDER BY w.created_at DESC;
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list workspaces: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| (row.get::<String, _>("id"), row.get::<String, _>("name")))
        .collect())
}

pub async fn user_has_workspace(
    pool: &SqlitePool,
    user_id: &str,
    workspace_id: &str,
) -> Result<bool, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 1
        FROM workspace_members
        WHERE user_id = ?1 AND workspace_id = ?2
        LIMIT 1;
        "#,
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("check workspace member: {}", e)))?;

    Ok(row.is_some())
}
