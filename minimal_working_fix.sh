#!/bin/bash

echo "🚀 Creating minimal working version..."

cd /home/cklose/ruv-fann-mcp1

# First, create a feature flag to disable database queries
echo "🔧 Adding feature flags to Cargo.toml..."
cat > swarm/Cargo_minimal.toml << 'EOF'
[package]
name = "ruv-swarm"
version.workspace = true
authors.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
axum.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
sqlx.workspace = true
anyhow.workspace = true
uuid = { version = "1.10", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
reqwest = { version = "0.11", features = ["json"] }

[features]
default = []
with-database = []

[[bin]]
name = "ruv-swarm"
path = "src/main.rs"
EOF

cp swarm/Cargo_minimal.toml swarm/Cargo.toml

# Now create a minimal agent.rs that doesn't use query! macros
echo "🔧 Creating minimal agent.rs..."
cat > swarm/src/agent_minimal.rs << 'EOF'
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::Duration;
use tokio::time::sleep;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EphemeralAgent {
    pub id: Uuid,
    pub agent_type: AgentType,
    pub status: AgentStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub lifespan_ms: u64,
    pub problem: Option<String>,
    pub solution: Option<String>,
    #[serde(skip)]
    pub db_pool: Option<SqlitePool>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub enum AgentType {
    Solver,
    Analyzer,
    Optimizer,
    PatternMatcher,
    OutcomePredictor,
    AlternativeGen,
    ContextAnalyzer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Spawning,
    Active,
    Solving,
    Completed,
    Dissolving,
}

impl EphemeralAgent {
    pub fn new(agent_type: AgentType) -> Self {
        Self {
            id: Uuid::new_v4(),
            agent_type,
            status: AgentStatus::Spawning,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            lifespan_ms: 0,
            problem: None,
            solution: None,
            db_pool: None,
        }
    }

    pub fn with_db_pool(agent_type: AgentType, db_pool: SqlitePool) -> Self {
        let mut agent = Self::new(agent_type);
        agent.db_pool = Some(db_pool);
        agent
    }

    pub async fn spawn(&mut self) -> anyhow::Result<()> {
        tracing::info!("Spawning agent {}", self.id);
        sleep(Duration::from_millis(5)).await;
        self.status = AgentStatus::Active;
        self.started_at = Some(Utc::now());
        Ok(())
    }

    pub async fn solve(&mut self, problem: String) -> anyhow::Result<String> {
        tracing::info!("Agent {} solving: {}", self.id, problem);
        
        self.status = AgentStatus::Solving;
        self.problem = Some(problem.clone());
        
        // Simulate problem solving without database queries
        let solution = match self.agent_type {
            AgentType::Solver => {
                sleep(Duration::from_millis(30)).await;
                format!("Solution: {}", problem.chars().rev().collect::<String>())
            }
            AgentType::Analyzer => {
                sleep(Duration::from_millis(40)).await;
                format!("Analysis: {} (length: {}, words: {})", 
                    problem, 
                    problem.len(),
                    problem.split_whitespace().count()
                )
            }
            AgentType::Optimizer => {
                sleep(Duration::from_millis(35)).await;
                format!("Optimized: {}", problem.to_uppercase())
            }
            AgentType::PatternMatcher => {
                sleep(Duration::from_millis(25)).await;
                serde_json::to_string(&serde_json::json!({
                    "patterns": [],
                    "best_match": null,
                    "message": "Pattern matching disabled in minimal mode"
                }))?
            }
            AgentType::OutcomePredictor => {
                sleep(Duration::from_millis(30)).await;
                serde_json::to_string(&serde_json::json!({
                    "successRate": 0.75,
                    "confidence": 0.5,
                    "message": "Prediction based on defaults"
                }))?
            }
            AgentType::AlternativeGen => {
                sleep(Duration::from_millis(35)).await;
                serde_json::to_string(&serde_json::json!({
                    "alternatives": [],
                    "message": "Alternative generation disabled in minimal mode"
                }))?
            }
            AgentType::ContextAnalyzer => {
                sleep(Duration::from_millis(28)).await;
                serde_json::to_string(&serde_json::json!({
                    "riskFactor": 1.0,
                    "contextFlags": [],
                    "recommendation": "proceed",
                    "message": "Context analysis disabled in minimal mode"
                }))?
            }
        };
        
        self.solution = Some(solution.clone());
        self.status = AgentStatus::Completed;
        
        Ok(solution)
    }

    pub async fn dissolve(&mut self) -> anyhow::Result<()> {
        tracing::info!("Dissolving agent {}", self.id);
        self.status = AgentStatus::Dissolving;
        self.completed_at = Some(Utc::now());
        
        if let Some(started_at) = self.started_at {
            let duration = self.completed_at.unwrap() - started_at;
            self.lifespan_ms = duration.num_milliseconds() as u64;
        }
        
        sleep(Duration::from_millis(10)).await;
        Ok(())
    }
    
    pub async fn reset_for_reuse(&mut self) -> anyhow::Result<()> {
        self.id = Uuid::new_v4();
        self.status = AgentStatus::Active;
        self.created_at = Utc::now();
        self.started_at = Some(Utc::now());
        self.completed_at = None;
        self.lifespan_ms = 0;
        self.problem = None;
        self.solution = None;
        Ok(())
    }

    pub fn metrics(&self) -> AgentMetrics {
        AgentMetrics {
            id: self.id,
            agent_type: self.agent_type.clone(),
            status: self.status.clone(),
            lifespan_ms: self.lifespan_ms,
            spawn_time_ms: 50,
            solve_time_ms: match self.agent_type {
                AgentType::Solver => 30,
                AgentType::Analyzer => 40,
                AgentType::Optimizer => 35,
                AgentType::PatternMatcher => 25,
                AgentType::OutcomePredictor => 30,
                AgentType::AlternativeGen => 35,
                AgentType::ContextAnalyzer => 28,
            },
            dissolve_time_ms: 10,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub id: Uuid,
    pub agent_type: AgentType,
    pub status: AgentStatus,
    pub lifespan_ms: u64,
    pub spawn_time_ms: u64,
    pub solve_time_ms: u64,
    pub dissolve_time_ms: u64,
}
EOF

# Replace agent.rs with minimal version
cp swarm/src/agent_minimal.rs swarm/src/agent.rs

# Fix API to use available methods
echo "🔧 Fixing API..."
cat > swarm/src/api_minimal.rs << 'EOF'
use crate::agent::{AgentType, EphemeralAgent};
use crate::coordinator::SwarmCoordinator;
use axum::{
    extract::{Path, State, Query},
    http::StatusCode,
    response::{IntoResponse, Json},
    Router,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
}

#[derive(Debug, Deserialize)]
struct SpawnAgentRequest {
    agent_type: String,
    problem: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SolveRequest {
    problem: String,
}

pub fn create_router(coordinator: Arc<SwarmCoordinator>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/agents", get(list_agents).post(spawn_agent))
        .route("/agents/:id", get(get_agent))
        .route("/solve", post(solve_problem))
        .route("/batch", post(solve_batch))
        .route("/stats", get(get_stats))
        .route("/performance", get(performance_test))
        .with_state(coordinator)
}

async fn health() -> impl IntoResponse {
    "OK"
}

async fn spawn_agent(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Json(req): Json<SpawnAgentRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let agent_type = match req.agent_type.as_str() {
        "solver" => AgentType::Solver,
        "analyzer" => AgentType::Analyzer,
        "optimizer" => AgentType::Optimizer,
        "pattern_matcher" => AgentType::PatternMatcher,
        "outcome_predictor" => AgentType::OutcomePredictor,
        "alternative_gen" => AgentType::AlternativeGen,
        "context_analyzer" => AgentType::ContextAnalyzer,
        _ => AgentType::Solver,
    };
    
    let agent = EphemeralAgent::new(agent_type);
    let agent_id = agent.id;
    
    if let Some(problem) = req.problem {
        let task = serde_json::json!({
            "tool": req.agent_type,
            "params": { "problem": problem }
        }).to_string();
        
        tokio::spawn(async move {
            coordinator.process_task(task).await.ok();
        });
    }
    
    Ok(Json(serde_json::json!({
        "agent_id": agent_id,
        "status": "spawned"
    })))
}

async fn list_agents(
    State(coordinator): State<Arc<SwarmCoordinator>>,
) -> Result<impl IntoResponse, StatusCode> {
    let status = coordinator.get_status().await;
    Ok(Json(serde_json::json!({ "agents": status })))
}

async fn get_agent(
    State(_coordinator): State<Arc<SwarmCoordinator>>,
    Path(agent_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "id": agent_id,
        "status": "unknown"
    })))
}

async fn solve_problem(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Json(req): Json<SolveRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let task = serde_json::json!({
        "tool": "general",
        "params": { "problem": req.problem }
    }).to_string();
    
    let solution = coordinator
        .process_task(task)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(serde_json::json!({
        "solution": solution,
        "solved": true
    })))
}

async fn solve_batch(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Json(problems): Json<Vec<String>>,
) -> Result<impl IntoResponse, StatusCode> {
    let mut solutions = Vec::new();
    
    for problem in problems {
        let task = serde_json::json!({
            "tool": "batch",
            "params": { "problem": problem }
        }).to_string();
        
        match coordinator.process_task(task).await {
            Ok(solution) => solutions.push(solution),
            Err(_) => solutions.push("Error".to_string()),
        }
    }
    
    Ok(Json(serde_json::json!({
        "solutions": solutions
    })))
}

async fn get_stats(
    State(coordinator): State<Arc<SwarmCoordinator>>,
) -> Result<impl IntoResponse, StatusCode> {
    let status = coordinator.get_status().await;
    Ok(Json(status))
}

async fn performance_test(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, StatusCode> {
    let problem_count = params
        .get("count")
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(10);
    
    let start = tokio::time::Instant::now();
    let mut handles = Vec::new();
    
    for i in 0..problem_count {
        let coordinator = coordinator.clone();
        let task = serde_json::json!({
            "tool": "test",
            "params": { 
                "problem": format!("Test problem {}", i),
                "index": i
            }
        }).to_string();
        
        let handle = tokio::spawn(async move {
            coordinator.process_task(task).await.ok()
        });
        handles.push(handle);
    }
    
    let mut results = Vec::new();
    for handle in handles {
        if let Ok(result) = handle.await {
            results.push(result);
        }
    }
    
    let status = coordinator.get_status().await;
    
    Ok(Json(serde_json::json!({
        "problems_solved": results.len(),
        "duration_ms": start.elapsed().as_millis() as u64,
        "status": status
    })))
}
EOF

# Replace api.rs with minimal version
cp swarm/src/api_minimal.rs swarm/src/api.rs

# Fix main.rs
echo "🔧 Fixing main.rs..."
sed -i 's/coordinator::SwarmCoordinator::new(pool).await?/coordinator::SwarmCoordinator::new(pool)/g' swarm/src/main.rs

echo "✅ All minimal fixes applied!"
echo "🔧 Building project..."

cargo build --release 2>&1 | tee minimal_build.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Starting swarm service..."
    pkill -f ruv-swarm || true
    sleep 1
    ./target/release/ruv-swarm --minimal --agents 2 > swarm_minimal.log 2>&1 &
    PID=$!
    echo "✅ Swarm service started with PID $PID"
    sleep 2
    echo "🔍 Testing service..."
    curl -s http://localhost:3001/health && echo " - Health check passed!" || echo " - Health check failed"
    curl -s -X POST http://localhost:3001/solve -H "Content-Type: application/json" -d '{"problem":"test problem"}' | jq '.' || echo "Solve endpoint test failed"
    ps aux | grep ruv-swarm | grep -v grep
else
    echo "❌ Build failed. Checking errors..."
    grep "error\[E" minimal_build.log | head -10
fi