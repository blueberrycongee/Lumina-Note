mod auth;
mod config;
mod dav;
mod db;
mod error;
mod models;
mod relay;
mod routes;
mod state;

use axum::routing::{any, get, post};
use axum::Router;
use config::Config;
use sqlx::sqlite::SqlitePoolOptions;
use state::AppState;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let config = Config::from_env();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    std::fs::create_dir_all(&config.data_dir)?;

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&config.db_url)
        .await?;
    db::init_db(&pool).await?;

    let state = AppState {
        pool,
        config,
        relay: state::RelayHub::new(),
    };

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/auth/register", post(routes::register))
        .route("/auth/login", post(routes::login))
        .route("/auth/refresh", post(routes::refresh))
        .route("/workspaces", get(routes::list_workspaces).post(routes::create_workspace))
        .route("/relay", get(relay::relay_handler))
        .route("/dav/:workspace_id", any(dav::handle_dav_root))
        .route("/dav/:workspace_id/*path", any(dav::handle_dav_path))
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    let bind_addr = state
        .config
        .bind
        .parse()
        .map_err(|_| "invalid LUMINA_BIND")?;
    tracing::info!("Lumina Sync Server listening on {}", bind_addr);
    axum::Server::bind(&bind_addr)
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
