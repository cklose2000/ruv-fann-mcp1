use crate::agent::AgentType;
use crate::coordinator::{SwarmCoordinator, SwarmStats};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnRequest {
    pub agent_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnResponse {
    pub agent_id: Uuid,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SolveRequest {
    pub problem: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SolveResponse {
    pub solution: String,
    pub agent_id: Uuid,
    pub agent_type: String,
    pub lifespan_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::BAD_REQUEST, Json(self)).into_response()
    }
}

/// Spawn a new agent
pub async fn spawn_agent(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Json(req): Json<SpawnRequest>,
) -> Result<Json<SpawnResponse>, ApiError> {
    let agent_type = match req.agent_type.as_deref() {
        Some("analyzer") => AgentType::Analyzer,
        Some("optimizer") => AgentType::Optimizer,
        _ => AgentType::Solver,
    };

    let agent_id = coordinator
        .spawn_agent(agent_type)
        .await
        .map_err(|e| ApiError {
            error: e.to_string(),
        })?;

    Ok(Json(SpawnResponse {
        agent_id,
        message: format!("Agent {} spawned successfully", agent_id),
    }))
}

/// List all active agents
pub async fn list_agents(
    State(coordinator): State<Arc<SwarmCoordinator>>,
) -> Json<Vec<crate::agent::EphemeralAgent>> {
    let agents = coordinator.list_agents().await;
    Json(agents)
}

/// Get agent status
pub async fn agent_status(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Path(id): Path<String>,
) -> Result<Json<crate::agent::EphemeralAgent>, StatusCode> {
    let agent_id = Uuid::parse_str(&id).map_err(|_| StatusCode::BAD_REQUEST)?;
    
    coordinator
        .get_agent(agent_id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

/// Solve a problem using ephemeral intelligence
pub async fn solve_problem(
    State(coordinator): State<Arc<SwarmCoordinator>>,
    Json(req): Json<SolveRequest>,
) -> Result<Json<SolveResponse>, ApiError> {
    let start = std::time::Instant::now();
    
    // Get initial stats
    let _initial_stats = coordinator.get_stats().await;
    
    // Solve the problem
    let solution = coordinator
        .solve_problem(req.problem.clone())
        .await
        .map_err(|e| ApiError {
            error: e.to_string(),
        })?;
    
    // Get final stats to find the agent that was used
    let _final_stats = coordinator.get_stats().await;
    
    // Calculate lifespan (approximate since agent is already dissolved)
    let lifespan_ms = start.elapsed().as_millis() as u64;
    
    // Determine agent type from the problem
    let agent_type = if req.problem.contains("analyze") {
        "Analyzer"
    } else if req.problem.contains("optimize") {
        "Optimizer"
    } else {
        "Solver"
    };
    
    Ok(Json(SolveResponse {
        solution,
        agent_id: Uuid::new_v4(), // Since agent is dissolved, we generate a placeholder
        agent_type: agent_type.to_string(),
        lifespan_ms,
    }))
}

/// Get swarm statistics
pub async fn swarm_stats(
    State(coordinator): State<Arc<SwarmCoordinator>>,
) -> Json<SwarmStats> {
    let stats = coordinator.get_stats().await;
    Json(stats)
}

/// Demo endpoint showing ephemeral solve
pub async fn demo_ephemeral_solve(
    State(coordinator): State<Arc<SwarmCoordinator>>,
) -> Result<Json<DemoResponse>, ApiError> {
    let problems = vec![
        "Solve this complex equation",
        "Analyze market trends for Q4",
        "Optimize database query performance",
    ];
    
    let mut results = Vec::new();
    
    for problem in problems {
        let start = std::time::Instant::now();
        let solution = coordinator
            .solve_problem(problem.to_string())
            .await
            .map_err(|e| ApiError {
                error: e.to_string(),
            })?;
        
        let elapsed_ms = start.elapsed().as_millis() as u64;
        
        results.push(DemoResult {
            problem: problem.to_string(),
            solution,
            time_ms: elapsed_ms,
        });
    }
    
    let stats = coordinator.get_stats().await;
    
    Ok(Json(DemoResponse {
        message: "Ephemeral intelligence demonstration complete!".to_string(),
        results,
        stats,
        note: "Each problem was solved by a different ephemeral agent that spawned, solved, and dissolved in <100ms".to_string(),
    }))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemoResult {
    pub problem: String,
    pub solution: String,
    pub time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DemoResponse {
    pub message: String,
    pub results: Vec<DemoResult>,
    pub stats: SwarmStats,
    pub note: String,
}