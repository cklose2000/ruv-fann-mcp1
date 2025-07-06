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
