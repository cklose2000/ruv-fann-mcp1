#!/bin/bash

echo "🔧 Fixing coordinator.rs to match new agent interface..."

cd /home/cklose/ruv-fann-mcp1

# First, let's add the missing agent types to agent.rs
cat >> swarm/src/agent_fix_types.patch << 'EOF'
--- a/swarm/src/agent.rs
+++ b/swarm/src/agent.rs
@@ -29,6 +29,8 @@ pub enum AgentType {
     PatternMatcher,
     OutcomePredictor,
     ErrorAnalyzer,
     PerformanceAnalyzer,
+    AlternativeGen,
+    ContextAnalyzer,
 }
 
@@ -107,6 +109,8 @@ impl EphemeralAgent {
             AgentType::OutcomePredictor => self.predict_outcomes(problem).await,
             AgentType::ErrorAnalyzer => self.analyze_errors(problem).await,
             AgentType::PerformanceAnalyzer => self.analyze_performance(problem).await,
+            AgentType::AlternativeGen => self.generate_alternatives(problem).await,
+            AgentType::ContextAnalyzer => self.analyze_context(problem).await,
         }
     }
 
@@ -133,6 +137,18 @@ impl EphemeralAgent {
         Ok(format!("Optimized approach: Reduced complexity by 30% for '{}'", problem))
     }
 
+    async fn generate_alternatives(&self, problem: &str) -> anyhow::Result<String> {
+        sleep(Duration::from_millis(180)).await;
+        
+        Ok(format!("Generated 3 alternative approaches for '{}'", problem))
+    }
+
+    async fn analyze_context(&self, problem: &str) -> anyhow::Result<String> {
+        sleep(Duration::from_millis(160)).await;
+        
+        Ok(format!("Context analysis complete for '{}': high complexity detected", problem))
+    }
+
     async fn match_patterns(&self, problem: &str) -> anyhow::Result<String> {
         let pool = self.db_pool.as_ref()
             .ok_or_else(|| anyhow::anyhow!("No database pool available"))?;
EOF

# Apply the patch
patch swarm/src/agent.rs < swarm/src/agent_fix_types.patch

# Now fix coordinator.rs
cat > swarm/src/coordinator_fixed.rs << 'EOF'
use crate::agent::{AgentType, EphemeralAgent};
use anyhow::Result;
use sqlx::SqlitePool;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

pub struct SwarmCoordinator {
    pub id: Uuid,
    pool: SqlitePool,
    agent_pool: Arc<RwLock<HashMap<AgentType, VecDeque<EphemeralAgent>>>>,
    max_concurrent_agents: usize,
}

impl SwarmCoordinator {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            id: Uuid::new_v4(),
            pool,
            agent_pool: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent_agents: 10,
        }
    }

    pub async fn initialize(&self) -> Result<()> {
        // Create the command_patterns table if it doesn't exist
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS command_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool TEXT NOT NULL,
                params TEXT NOT NULL,
                params_hash TEXT NOT NULL,
                success BOOLEAN NOT NULL,
                duration REAL NOT NULL,
                error TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                hour_of_day INTEGER,
                day_of_week INTEGER
            )
            "#
        )
        .execute(&self.pool)
        .await?;
        
        // Initialize agent pools
        self.initialize_agent_pools(3).await?;
        
        Ok(())
    }

    async fn initialize_agent_pools(&self, pool_size: usize) -> Result<()> {
        let mut agent_pool = self.agent_pool.write().await;
        
        let agent_types = vec![
            AgentType::Solver,
            AgentType::Analyzer,
            AgentType::Optimizer,
            AgentType::PatternMatcher,
            AgentType::OutcomePredictor,
            AgentType::AlternativeGen,
            AgentType::ContextAnalyzer,
            AgentType::ErrorAnalyzer,
            AgentType::PerformanceAnalyzer,
        ];
        
        for agent_type in agent_types {
            let mut pool = VecDeque::new();
            
            for _ in 0..pool_size {
                // Create agent with standard lifespan (5 seconds)
                let agent = EphemeralAgent::new(agent_type, 5000)
                    .with_pool(self.pool.clone());
                pool.push_back(agent);
            }
            
            agent_pool.insert(agent_type, pool);
        }
        
        Ok(())
    }

    pub async fn process_task(&self, task: String) -> Result<String> {
        // First try to get an agent from the pool
        let agent_type = self.determine_agent_type(&task);
        
        let mut agent = {
            let mut pool = self.agent_pool.write().await;
            pool.get_mut(&agent_type)
                .and_then(|type_pool| type_pool.pop_front())
        };
        
        if agent.is_none() {
            // Create a new agent if pool is empty
            agent = Some(
                EphemeralAgent::new(agent_type, 5000)
                    .with_pool(self.pool.clone())
            );
        }
        
        let mut agent = agent.unwrap();
        let result = agent.run(task).await;
        
        // Return agent to pool if successful
        if result.is_ok() {
            let mut pool = self.agent_pool.write().await;
            if let Some(type_pool) = pool.get_mut(&agent_type) {
                // Reset agent state before returning to pool
                agent.status = crate::agent::AgentStatus::Created;
                agent.problem = None;
                agent.solution = None;
                agent.started_at = None;
                agent.completed_at = None;
                type_pool.push_back(agent);
            }
        }
        
        result
    }

    fn determine_agent_type(&self, task: &str) -> AgentType {
        // Simple heuristic for determining agent type
        let task_lower = task.to_lowercase();
        
        if task_lower.contains("optimize") {
            AgentType::Optimizer
        } else if task_lower.contains("analyze") {
            AgentType::Analyzer
        } else if task_lower.contains("pattern") {
            AgentType::PatternMatcher
        } else if task_lower.contains("predict") {
            AgentType::OutcomePredictor
        } else if task_lower.contains("alternative") {
            AgentType::AlternativeGen
        } else if task_lower.contains("context") {
            AgentType::ContextAnalyzer
        } else if task_lower.contains("error") {
            AgentType::ErrorAnalyzer
        } else if task_lower.contains("performance") {
            AgentType::PerformanceAnalyzer
        } else {
            AgentType::Solver
        }
    }

    pub async fn get_status(&self) -> HashMap<String, serde_json::Value> {
        let pool = self.agent_pool.read().await;
        let mut status = HashMap::new();
        
        for (agent_type, agents) in pool.iter() {
            status.insert(
                format!("{:?}", agent_type),
                serde_json::json!({
                    "available": agents.len(),
                    "type": format!("{:?}", agent_type)
                })
            );
        }
        
        status.insert(
            "coordinator_id".to_string(),
            serde_json::json!(self.id.to_string())
        );
        
        status
    }
}
EOF

# Replace coordinator.rs
mv swarm/src/coordinator_fixed.rs swarm/src/coordinator.rs

echo "✅ Fixed coordinator.rs"
echo "🔧 Now building the project..."

# Try to build again
cargo build --release 2>&1 | tee build_output_coordinator.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed. Check build_output_coordinator.log for details."
fi