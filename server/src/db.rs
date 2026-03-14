use crate::error::AppError;
use chrono::Utc;
use sqlx::{Row, SqlitePool};
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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create organizations table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS org_members (
            org_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','member','guest')),
            joined_at INTEGER NOT NULL,
            PRIMARY KEY (org_id, user_id)
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create org_members table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create projects table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            assignee_id TEXT,
            due_date INTEGER,
            start_date INTEGER,
            position REAL NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create tasks table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS task_labels (
            task_id TEXT NOT NULL,
            label TEXT NOT NULL,
            PRIMARY KEY (task_id, label)
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create task_labels table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            doc_path TEXT NOT NULL,
            org_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            range_start INTEGER NOT NULL,
            range_end INTEGER NOT NULL,
            content TEXT NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create annotations table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS annotation_replies (
            id TEXT PRIMARY KEY,
            annotation_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create annotation_replies table: {}", e)))?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            org_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            ref_id TEXT NOT NULL DEFAULT '',
            read INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create notifications table: {}", e)))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Struct definitions for team collaboration
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub struct TaskRow {
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
}

#[allow(dead_code)]
pub struct AnnotationRow {
    pub id: String,
    pub doc_path: String,
    pub org_id: String,
    pub user_id: String,
    pub range_start: i64,
    pub range_end: i64,
    pub content: String,
    pub resolved: bool,
    pub created_at: i64,
}

#[allow(dead_code)]
pub struct NotificationRow {
    pub id: String,
    pub user_id: String,
    pub org_id: String,
    pub ntype: String,
    pub title: String,
    pub body: String,
    pub ref_id: String,
    pub read: bool,
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

pub async fn create_user(
    pool: &SqlitePool,
    email: &str,
    password_hash: &str,
) -> Result<String, AppError> {
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

    Ok(row.map(|row| {
        (
            row.get::<String, _>("id"),
            row.get::<String, _>("password_hash"),
        )
    }))
}

#[allow(dead_code)]
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

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

pub async fn create_organization(
    pool: &SqlitePool,
    owner_id: &str,
    name: &str,
) -> Result<String, AppError> {
    let org_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO organizations (id, name, owner_id, created_at)
        VALUES (?1, ?2, ?3, ?4);
        "#,
    )
    .bind(&org_id)
    .bind(name)
    .bind(owner_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create organization: {}", e)))?;

    sqlx::query(
        r#"
        INSERT INTO org_members (org_id, user_id, role, joined_at)
        VALUES (?1, ?2, 'admin', ?3);
        "#,
    )
    .bind(&org_id)
    .bind(owner_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("insert org owner member: {}", e)))?;

    Ok(org_id)
}

pub async fn list_user_organizations(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Vec<(String, String, String)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT o.id, o.name, m.role
        FROM organizations o
        JOIN org_members m
          ON o.id = m.org_id
        WHERE m.user_id = ?1
        ORDER BY o.created_at DESC;
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list user organizations: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("id"),
                row.get::<String, _>("name"),
                row.get::<String, _>("role"),
            )
        })
        .collect())
}

pub async fn get_organization(
    pool: &SqlitePool,
    org_id: &str,
) -> Result<Option<(String, String, String)>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, name, owner_id
        FROM organizations
        WHERE id = ?1;
        "#,
    )
    .bind(org_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get organization: {}", e)))?;

    Ok(row.map(|row| {
        (
            row.get::<String, _>("id"),
            row.get::<String, _>("name"),
            row.get::<String, _>("owner_id"),
        )
    }))
}

pub async fn update_organization_name(
    pool: &SqlitePool,
    org_id: &str,
    name: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE organizations
        SET name = ?1
        WHERE id = ?2;
        "#,
    )
    .bind(name)
    .bind(org_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("update organization name: {}", e)))?;

    Ok(())
}

pub async fn add_org_member(
    pool: &SqlitePool,
    org_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), AppError> {
    let now = Utc::now().timestamp();

    let result = sqlx::query(
        r#"
        INSERT INTO org_members (org_id, user_id, role, joined_at)
        VALUES (?1, ?2, ?3, ?4);
        "#,
    )
    .bind(org_id)
    .bind(user_id)
    .bind(role)
    .bind(now)
    .execute(pool)
    .await;

    if let Err(err) = result {
        let message = err.to_string();
        if message.contains("UNIQUE") {
            return Err(AppError::Conflict("member already exists".to_string()));
        }
        return Err(AppError::Internal(format!("add org member: {}", err)));
    }

    Ok(())
}

pub async fn remove_org_member(
    pool: &SqlitePool,
    org_id: &str,
    user_id: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        DELETE FROM org_members
        WHERE org_id = ?1 AND user_id = ?2;
        "#,
    )
    .bind(org_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("remove org member: {}", e)))?;

    Ok(())
}

pub async fn list_org_members(
    pool: &SqlitePool,
    org_id: &str,
) -> Result<Vec<(String, String, String)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT m.user_id, u.email, m.role
        FROM org_members m
        JOIN users u
          ON m.user_id = u.id
        WHERE m.org_id = ?1
        ORDER BY m.joined_at ASC;
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list org members: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("user_id"),
                row.get::<String, _>("email"),
                row.get::<String, _>("role"),
            )
        })
        .collect())
}

pub async fn get_org_member_role(
    pool: &SqlitePool,
    org_id: &str,
    user_id: &str,
) -> Result<Option<String>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT role
        FROM org_members
        WHERE org_id = ?1 AND user_id = ?2;
        "#,
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get org member role: {}", e)))?;

    Ok(row.map(|row| row.get::<String, _>("role")))
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

pub async fn create_project(
    pool: &SqlitePool,
    org_id: &str,
    name: &str,
    description: &str,
) -> Result<String, AppError> {
    let project_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO projects (id, org_id, name, description, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5);
        "#,
    )
    .bind(&project_id)
    .bind(org_id)
    .bind(name)
    .bind(description)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create project: {}", e)))?;

    Ok(project_id)
}

pub async fn list_projects(
    pool: &SqlitePool,
    org_id: &str,
) -> Result<Vec<(String, String, String)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, name, description
        FROM projects
        WHERE org_id = ?1
        ORDER BY created_at DESC;
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list projects: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("id"),
                row.get::<String, _>("name"),
                row.get::<String, _>("description"),
            )
        })
        .collect())
}

pub async fn get_project(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<Option<(String, String, String, String)>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, org_id, name, description
        FROM projects
        WHERE id = ?1;
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get project: {}", e)))?;

    Ok(row.map(|row| {
        (
            row.get::<String, _>("id"),
            row.get::<String, _>("org_id"),
            row.get::<String, _>("name"),
            row.get::<String, _>("description"),
        )
    }))
}

pub async fn delete_project(pool: &SqlitePool, project_id: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"
        DELETE FROM projects
        WHERE id = ?1;
        "#,
    )
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("delete project: {}", e)))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
pub async fn create_task(
    pool: &SqlitePool,
    project_id: &str,
    title: &str,
    description: &str,
    status: &str,
    priority: &str,
    assignee_id: Option<&str>,
    due_date: Option<i64>,
    start_date: Option<i64>,
    created_by: &str,
) -> Result<String, AppError> {
    let task_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, due_date, start_date, position, created_by, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);
        "#,
    )
    .bind(&task_id)
    .bind(project_id)
    .bind(title)
    .bind(description)
    .bind(status)
    .bind(priority)
    .bind(assignee_id)
    .bind(due_date)
    .bind(start_date)
    .bind(0.0_f64)
    .bind(created_by)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create task: {}", e)))?;

    Ok(task_id)
}

#[allow(clippy::too_many_arguments)]
pub async fn update_task(
    pool: &SqlitePool,
    task_id: &str,
    title: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
    priority: Option<&str>,
    assignee_id: Option<Option<&str>>,
    due_date: Option<Option<i64>>,
    start_date: Option<Option<i64>>,
    position: Option<f64>,
) -> Result<(), AppError> {
    let now = Utc::now().timestamp();
    // Fetch current task, then do a full UPDATE with merged values.
    let current = get_task(pool, task_id).await?;
    let current = current.ok_or(AppError::NotFound)?;

    let final_title = title.unwrap_or(&current.title);
    let final_description = description.unwrap_or(&current.description);
    let final_status = status.unwrap_or(&current.status);
    let final_priority = priority.unwrap_or(&current.priority);
    let final_assignee_id: Option<String> = match assignee_id {
        Some(v) => v.map(|s| s.to_string()),
        None => current.assignee_id,
    };
    let final_due_date: Option<i64> = match due_date {
        Some(v) => v,
        None => current.due_date,
    };
    let final_start_date: Option<i64> = match start_date {
        Some(v) => v,
        None => current.start_date,
    };
    let final_position = position.unwrap_or(current.position);

    sqlx::query(
        r#"
        UPDATE tasks
        SET title = ?1, description = ?2, status = ?3, priority = ?4,
            assignee_id = ?5, due_date = ?6, start_date = ?7, position = ?8,
            updated_at = ?9
        WHERE id = ?10;
        "#,
    )
    .bind(final_title)
    .bind(final_description)
    .bind(final_status)
    .bind(final_priority)
    .bind(&final_assignee_id)
    .bind(final_due_date)
    .bind(final_start_date)
    .bind(final_position)
    .bind(now)
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("update task: {}", e)))?;

    Ok(())
}

pub async fn list_tasks(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<Vec<TaskRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, project_id, title, description, status, priority,
               assignee_id, due_date, start_date, position, created_by,
               created_at, updated_at
        FROM tasks
        WHERE project_id = ?1
        ORDER BY position ASC, created_at ASC;
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list tasks: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| TaskRow {
            id: row.get::<String, _>("id"),
            project_id: row.get::<String, _>("project_id"),
            title: row.get::<String, _>("title"),
            description: row.get::<String, _>("description"),
            status: row.get::<String, _>("status"),
            priority: row.get::<String, _>("priority"),
            assignee_id: row.get::<Option<String>, _>("assignee_id"),
            due_date: row.get::<Option<i64>, _>("due_date"),
            start_date: row.get::<Option<i64>, _>("start_date"),
            position: row.get::<f64, _>("position"),
            created_by: row.get::<String, _>("created_by"),
            created_at: row.get::<i64, _>("created_at"),
            updated_at: row.get::<i64, _>("updated_at"),
        })
        .collect())
}

pub async fn get_task(
    pool: &SqlitePool,
    task_id: &str,
) -> Result<Option<TaskRow>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, project_id, title, description, status, priority,
               assignee_id, due_date, start_date, position, created_by,
               created_at, updated_at
        FROM tasks
        WHERE id = ?1;
        "#,
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get task: {}", e)))?;

    Ok(row.map(|row| TaskRow {
        id: row.get::<String, _>("id"),
        project_id: row.get::<String, _>("project_id"),
        title: row.get::<String, _>("title"),
        description: row.get::<String, _>("description"),
        status: row.get::<String, _>("status"),
        priority: row.get::<String, _>("priority"),
        assignee_id: row.get::<Option<String>, _>("assignee_id"),
        due_date: row.get::<Option<i64>, _>("due_date"),
        start_date: row.get::<Option<i64>, _>("start_date"),
        position: row.get::<f64, _>("position"),
        created_by: row.get::<String, _>("created_by"),
        created_at: row.get::<i64, _>("created_at"),
        updated_at: row.get::<i64, _>("updated_at"),
    }))
}

pub async fn delete_task(pool: &SqlitePool, task_id: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"
        DELETE FROM tasks
        WHERE id = ?1;
        "#,
    )
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("delete task: {}", e)))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Annotation CRUD
// ---------------------------------------------------------------------------

pub async fn create_annotation(
    pool: &SqlitePool,
    doc_path: &str,
    org_id: &str,
    user_id: &str,
    range_start: i64,
    range_end: i64,
    content: &str,
) -> Result<String, AppError> {
    let annotation_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO annotations (id, doc_path, org_id, user_id, range_start, range_end, content, resolved, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8);
        "#,
    )
    .bind(&annotation_id)
    .bind(doc_path)
    .bind(org_id)
    .bind(user_id)
    .bind(range_start)
    .bind(range_end)
    .bind(content)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create annotation: {}", e)))?;

    Ok(annotation_id)
}

pub async fn list_annotations(
    pool: &SqlitePool,
    doc_path: &str,
    org_id: &str,
) -> Result<Vec<AnnotationRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, doc_path, org_id, user_id, range_start, range_end, content, resolved, created_at
        FROM annotations
        WHERE doc_path = ?1 AND org_id = ?2
        ORDER BY range_start ASC, created_at ASC;
        "#,
    )
    .bind(doc_path)
    .bind(org_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list annotations: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| AnnotationRow {
            id: row.get::<String, _>("id"),
            doc_path: row.get::<String, _>("doc_path"),
            org_id: row.get::<String, _>("org_id"),
            user_id: row.get::<String, _>("user_id"),
            range_start: row.get::<i64, _>("range_start"),
            range_end: row.get::<i64, _>("range_end"),
            content: row.get::<String, _>("content"),
            resolved: row.get::<i32, _>("resolved") != 0,
            created_at: row.get::<i64, _>("created_at"),
        })
        .collect())
}

pub async fn create_annotation_reply(
    pool: &SqlitePool,
    annotation_id: &str,
    user_id: &str,
    content: &str,
) -> Result<String, AppError> {
    let reply_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO annotation_replies (id, annotation_id, user_id, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5);
        "#,
    )
    .bind(&reply_id)
    .bind(annotation_id)
    .bind(user_id)
    .bind(content)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create annotation reply: {}", e)))?;

    Ok(reply_id)
}

pub async fn list_annotation_replies(
    pool: &SqlitePool,
    annotation_id: &str,
) -> Result<Vec<(String, String, String, i64)>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, user_id, content, created_at
        FROM annotation_replies
        WHERE annotation_id = ?1
        ORDER BY created_at ASC;
        "#,
    )
    .bind(annotation_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list annotation replies: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("id"),
                row.get::<String, _>("user_id"),
                row.get::<String, _>("content"),
                row.get::<i64, _>("created_at"),
            )
        })
        .collect())
}

pub async fn get_annotation(
    pool: &SqlitePool,
    annotation_id: &str,
) -> Result<Option<AnnotationRow>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, doc_path, org_id, user_id, range_start, range_end, content, resolved, created_at
        FROM annotations
        WHERE id = ?1;
        "#,
    )
    .bind(annotation_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Internal(format!("get annotation: {}", e)))?;

    Ok(row.map(|row| AnnotationRow {
        id: row.get::<String, _>("id"),
        doc_path: row.get::<String, _>("doc_path"),
        org_id: row.get::<String, _>("org_id"),
        user_id: row.get::<String, _>("user_id"),
        range_start: row.get::<i64, _>("range_start"),
        range_end: row.get::<i64, _>("range_end"),
        content: row.get::<String, _>("content"),
        resolved: row.get::<i32, _>("resolved") != 0,
        created_at: row.get::<i64, _>("created_at"),
    }))
}

pub async fn resolve_annotation(pool: &SqlitePool, annotation_id: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE annotations
        SET resolved = 1
        WHERE id = ?1;
        "#,
    )
    .bind(annotation_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("resolve annotation: {}", e)))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Notification CRUD
// ---------------------------------------------------------------------------

pub async fn create_notification(
    pool: &SqlitePool,
    user_id: &str,
    org_id: &str,
    ntype: &str,
    title: &str,
    body: &str,
    ref_id: &str,
) -> Result<String, AppError> {
    let notification_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    sqlx::query(
        r#"
        INSERT INTO notifications (id, user_id, org_id, type, title, body, ref_id, read, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8);
        "#,
    )
    .bind(&notification_id)
    .bind(user_id)
    .bind(org_id)
    .bind(ntype)
    .bind(title)
    .bind(body)
    .bind(ref_id)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("create notification: {}", e)))?;

    Ok(notification_id)
}

pub async fn list_notifications(
    pool: &SqlitePool,
    user_id: &str,
    limit: i64,
) -> Result<Vec<NotificationRow>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, user_id, org_id, type, title, body, ref_id, read, created_at
        FROM notifications
        WHERE user_id = ?1
        ORDER BY created_at DESC
        LIMIT ?2;
        "#,
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Internal(format!("list notifications: {}", e)))?;

    Ok(rows
        .into_iter()
        .map(|row| NotificationRow {
            id: row.get::<String, _>("id"),
            user_id: row.get::<String, _>("user_id"),
            org_id: row.get::<String, _>("org_id"),
            ntype: row.get::<String, _>("type"),
            title: row.get::<String, _>("title"),
            body: row.get::<String, _>("body"),
            ref_id: row.get::<String, _>("ref_id"),
            read: row.get::<i32, _>("read") != 0,
            created_at: row.get::<i64, _>("created_at"),
        })
        .collect())
}

pub async fn mark_notification_read(
    pool: &SqlitePool,
    notification_id: &str,
    user_id: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE notifications
        SET read = 1
        WHERE id = ?1 AND user_id = ?2;
        "#,
    )
    .bind(notification_id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("mark notification read: {}", e)))?;

    Ok(())
}

pub async fn mark_all_notifications_read(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE notifications
        SET read = 1
        WHERE user_id = ?1 AND read = 0;
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("mark all notifications read: {}", e)))?;

    Ok(())
}

pub async fn count_unread_notifications(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<i64, AppError> {
    let row = sqlx::query(
        r#"
        SELECT COUNT(*) as cnt
        FROM notifications
        WHERE user_id = ?1 AND read = 0;
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Internal(format!("count unread notifications: {}", e)))?;

    Ok(row.get::<i64, _>("cnt"))
}
