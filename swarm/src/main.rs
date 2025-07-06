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
        .max_connections(20)
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
    
    // Create command_patterns table for pattern learning
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS command_patterns (
            id TEXT PRIMARY KEY,
            tool TEXT NOT NULL,
            params TEXT NOT NULL,
            context TEXT NOT NULL,
            outcome TEXT NOT NULL,
            success BOOLEAN NOT NULL,
            duration INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            error TEXT,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
        "#
    )
    .execute(&pool)
    .await?;
    
    // Create indexes for command_patterns
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_command_patterns_tool ON command_patterns(tool)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_command_patterns_success ON command_patterns(success)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_command_patterns_timestamp ON command_patterns(timestamp)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_command_patterns_agent_type ON command_patterns(agent_type)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_command_patterns_tool_success ON command_patterns(tool, success)")
        .execute(&pool)
        .await?;

    // Create coordinator
    let coordinator = Arc::new(coordinator::SwarmCoordinator::new(pool));

    // Parse options
    let args: Vec<String> = std::env::args().collect();
    let minimal = args.contains(&"--minimal".to_string());
    let max_agents = if minimal { 5 } else { 20 };
    
    if args.contains(&"--agents".to_string()) {
        if let Some(pos) = args.iter().position(|x| x == "--agents") {
            if let Some(count) = args.get(pos + 1) {
                if let Ok(n) = count.parse::<usize>() {
                }
            }
        }
    } else {
        // Max agents set at initialization
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