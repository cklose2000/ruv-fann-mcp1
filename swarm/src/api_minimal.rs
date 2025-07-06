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
