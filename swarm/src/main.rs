mod agent;
mod coordinator;
mod api;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ruv_swarm=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize SQLite database
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:ruv_swarm.db".to_string());
    
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Create tables if they don't exist
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            agent_type TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            lifespan_ms INTEGER,
            problem TEXT,
            solution TEXT
        )
        "#
    )
    .execute(&pool)
    .await?;
    
    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at)")
        .execute(&pool)
        .await?;

    // Create coordinator
    let coordinator = Arc::new(coordinator::SwarmCoordinator::new(pool).await?);

    // Parse options
    let args: Vec<String> = std::env::args().collect();
    let minimal = args.contains(&"--minimal".to_string());
    let max_agents = if minimal { 2 } else { 5 };
    
    if args.contains(&"--agents".to_string()) {
        if let Some(pos) = args.iter().position(|x| x == "--agents") {
            if let Some(count) = args.get(pos + 1) {
                if let Ok(n) = count.parse::<usize>() {
                    coordinator.set_max_agents(n).await;
                }
            }
        }
    } else {
        coordinator.set_max_agents(max_agents).await;
    }

    // Build our application with routes
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/spawn", post(api::spawn_agent))
        .route("/api/agents", get(api::list_agents))
        .route("/api/agent/:id", get(api::agent_status))
        .route("/api/agent/:id/result", get(api::get_agent_result))
        .route("/api/agent/spawn", post(api::spawn_agent))
        .route("/api/solve", post(api::solve_problem))
        .route("/api/stats", get(api::swarm_stats))
        .route("/demo/ephemeral-solve", get(api::demo_ephemeral_solve))
        .layer(CorsLayer::permissive())
        .with_state(coordinator);

    // Get port from environment or use default
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse::<u16>()?;
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("ruv-swarm coordinator listening on {} (max_agents: {})", addr, max_agents);

    axum::serve(
        tokio::net::TcpListener::bind(addr).await?,
        app,
    )
    .await?;

    Ok(())
}

async fn root() -> &'static str {
    "ruv-swarm - Ephemeral Intelligence POC"
}

async fn health() -> &'static str {
    "OK"
}