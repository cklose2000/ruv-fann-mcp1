use crate::agent::{AgentType, EphemeralAgent, AgentStatus};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Clone)]
pub struct SwarmCoordinator {
    pool: SqlitePool,
    agents: Arc<RwLock<HashMap<Uuid, EphemeralAgent>>>,
    max_agents: Arc<RwLock<usize>>,
    total_spawned: Arc<RwLock<usize>>,
    total_dissolved: Arc<RwLock<usize>>,
}

impl SwarmCoordinator {
    /// Create a new swarm coordinator
    pub async fn new(pool: SqlitePool) -> anyhow::Result<Self> {
        Ok(Self {
            pool,
            agents: Arc::new(RwLock::new(HashMap::new())),
            max_agents: Arc::new(RwLock::new(3)),
            total_spawned: Arc::new(RwLock::new(0)),
            total_dissolved: Arc::new(RwLock::new(0)),
        })
    }

    /// Set maximum number of agents
    pub async fn set_max_agents(&self, max: usize) {
        let mut max_agents = self.max_agents.write().await;
        *max_agents = max;
    }

    /// Spawn a new ephemeral agent
    pub async fn spawn_agent(&self, agent_type: AgentType) -> anyhow::Result<Uuid> {
        // Check if we're at capacity
        let agents = self.agents.read().await;
        let active_count = agents.values()
            .filter(|a| a.status != AgentStatus::Dissolving)
            .count();
        
        let max_agents = *self.max_agents.read().await;
        if active_count >= max_agents {
            anyhow::bail!("Maximum agent capacity reached ({}/{})", active_count, max_agents);
        }
        drop(agents);

        // Create and spawn agent
        let mut agent = EphemeralAgent::new(agent_type);
        agent.spawn().await?;
        
        let agent_id = agent.id;
        
        // Store agent
        let mut agents = self.agents.write().await;
        agents.insert(agent_id, agent);
        
        // Update counter
        let mut total = self.total_spawned.write().await;
        *total += 1;
        
        // Store in database
        sqlx::query(
            r#"
            INSERT INTO agents (id, agent_type, status, created_at)
            VALUES (?1, ?2, ?3, ?4)
            "#
        )
        .bind(agent_id.to_string())
        .bind(format!("{:?}", agent_type))
        .bind("Active")
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        
        Ok(agent_id)
    }

    /// Solve a problem using an ephemeral agent
    pub async fn solve_problem(&self, problem: String) -> anyhow::Result<String> {
        // Determine best agent type for the problem
        let agent_type = if problem.contains("analyze") {
            AgentType::Analyzer
        } else if problem.contains("optimize") {
            AgentType::Optimizer
        } else {
            AgentType::Solver
        };
        
        // Spawn agent
        let agent_id = self.spawn_agent(agent_type).await?;
        
        // Solve problem
        let solution = {
            let mut agents = self.agents.write().await;
            let agent = agents.get_mut(&agent_id)
                .ok_or_else(|| anyhow::anyhow!("Agent not found"))?;
            
            agent.solve(problem).await?
        };
        
        // Dissolve agent
        self.dissolve_agent(agent_id).await?;
        
        Ok(solution)
    }

    /// Dissolve an agent
    pub async fn dissolve_agent(&self, agent_id: Uuid) -> anyhow::Result<()> {
        let mut agents = self.agents.write().await;
        
        if let Some(agent) = agents.get_mut(&agent_id) {
            agent.dissolve().await?;
            
            // Update database
            sqlx::query(
                r#"
                UPDATE agents 
                SET status = ?1, completed_at = ?2, lifespan_ms = ?3
                WHERE id = ?4
                "#
            )
            .bind("Dissolved")
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(agent.lifespan_ms as i64)
            .bind(agent_id.to_string())
            .execute(&self.pool)
            .await?;
            
            // Remove from active agents
            agents.remove(&agent_id);
            
            // Update counter
            let mut total = self.total_dissolved.write().await;
            *total += 1;
        }
        
        Ok(())
    }

    /// Get all active agents
    pub async fn list_agents(&self) -> Vec<EphemeralAgent> {
        let agents = self.agents.read().await;
        agents.values().cloned().collect()
    }

    /// Get agent by ID
    pub async fn get_agent(&self, agent_id: Uuid) -> Option<EphemeralAgent> {
        let agents = self.agents.read().await;
        agents.get(&agent_id).cloned()
    }

    /// Get swarm statistics
    pub async fn get_stats(&self) -> SwarmStats {
        let agents = self.agents.read().await;
        let active_count = agents.len();
        
        let total_spawned = *self.total_spawned.read().await;
        let total_dissolved = *self.total_dissolved.read().await;
        
        // Calculate average lifespan from database
        let avg_lifespan: Option<f64> = sqlx::query_scalar(
            r#"
            SELECT AVG(lifespan_ms)
            FROM agents
            WHERE lifespan_ms IS NOT NULL
            "#
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(None);
        
        let avg_lifespan = avg_lifespan.unwrap_or(0.0);
        
        SwarmStats {
            active_agents: active_count,
            total_spawned,
            total_dissolved,
            average_lifespan_ms: avg_lifespan as u64,
            max_agents: *self.max_agents.read().await,
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SwarmStats {
    pub active_agents: usize,
    pub total_spawned: usize,
    pub total_dissolved: usize,
    pub average_lifespan_ms: u64,
    pub max_agents: usize,
}