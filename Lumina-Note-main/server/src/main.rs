mod auth;
mod config;
mod dav;
mod db;
mod error;
mod models;
mod relay;
mod routes;
mod state;

use axum::http::{HeaderName, Request};
use axum::routing::{any, get, post};
use axum::Router;
use config::Config;
use sqlx::sqlite::SqlitePoolOptions;
use state::AppState;
use std::sync::Arc;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let config = Config::from_env();
    if config.jwt_secret == "dev-secret-change-me" {
        if cfg!(debug_assertions) {
            tracing::warn!(
                "LUMINA_JWT_SECRET is using the default value; do not use this in production."
            );
        } else {
            return Err("LUMINA_JWT_SECRET must be set for production".into());
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    std::fs::create_dir_all(&config.data_dir)?;

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&config.db_url)
        .await?;
    db::init_db(&pool).await?;

    let bind_addr = config.bind.parse().map_err(|_| "invalid LUMINA_BIND")?;

    let state = AppState {
        pool,
        config,
        relay: state::RelayHub::new(),
        metrics: Arc::new(state::ServerMetrics::new()),
    };

    let trace_layer = TraceLayer::new_for_http().make_span_with(|req: &Request<_>| {
        let request_id = req
            .headers()
            .get(&REQUEST_ID_HEADER)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("-");
        tracing::info_span!(
            "http",
            method = %req.method(),
            uri = %req.uri(),
            request_id = %request_id
        )
    });

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/metrics", get(routes::metrics))
        .route("/auth/register", post(routes::register))
        .route("/auth/login", post(routes::login))
        .route("/auth/refresh", post(routes::refresh))
        .route(
            "/workspaces",
            get(routes::list_workspaces).post(routes::create_workspace),
        )
        .route("/relay", get(relay::relay_handler))
        .route("/dav/:workspace_id", any(dav::handle_dav_root))
        .route("/dav/:workspace_id/*path", any(dav::handle_dav_path))
        .with_state(state)
        .layer(PropagateRequestIdLayer::new(REQUEST_ID_HEADER))
        .layer(SetRequestIdLayer::new(REQUEST_ID_HEADER, MakeRequestUuid))
        .layer(trace_layer);
    tracing::info!("Lumina Sync Server listening on {}", bind_addr);
    axum::Server::bind(&bind_addr)
        .serve(app.into_make_service())
        .await?;

    Ok(())
}
