#!/bin/bash

echo "🔧 Fixing SQLx queries in agent.rs..."

cd /home/cklose/ruv-fann-mcp1

# Create a fixed version of agent.rs
cat > swarm/src/agent_fixed.rs << 'EOF'
use chrono::{DateTime, Utc, Timelike, Datelike};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
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
    // Pattern analysis agents for MCP
    PatternMatcher,
    OutcomePredictor,
    ErrorAnalyzer,
    PerformanceAnalyzer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentStatus {
    Created,
    Running,
    Completed,
    Failed,
    Expired,
}

impl EphemeralAgent {
    pub fn new(agent_type: AgentType, lifespan_ms: u64) -> Self {
        Self {
            id: Uuid::new_v4(),
            agent_type,
            status: AgentStatus::Created,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            lifespan_ms,
            problem: None,
            solution: None,
            db_pool: None,
        }
    }

    pub fn with_pool(mut self, pool: SqlitePool) -> Self {
        self.db_pool = Some(pool);
        self
    }

    pub async fn run(&mut self, problem: String) -> anyhow::Result<String> {
        self.status = AgentStatus::Running;
        self.started_at = Some(Utc::now());
        self.problem = Some(problem.clone());

        // Set a deadline based on lifespan
        let deadline = tokio::time::Instant::now() + Duration::from_millis(self.lifespan_ms);

        // Execute with timeout
        let result = tokio::time::timeout_at(
            deadline,
            self.execute_task(&problem)
        ).await;

        match result {
            Ok(Ok(solution)) => {
                self.status = AgentStatus::Completed;
                self.solution = Some(solution.clone());
                self.completed_at = Some(Utc::now());
                Ok(solution)
            }
            Ok(Err(e)) => {
                self.status = AgentStatus::Failed;
                self.completed_at = Some(Utc::now());
                Err(e)
            }
            Err(_) => {
                self.status = AgentStatus::Expired;
                self.completed_at = Some(Utc::now());
                Err(anyhow::anyhow!("Agent expired after {} ms", self.lifespan_ms))
            }
        }
    }

    async fn execute_task(&self, problem: &str) -> anyhow::Result<String> {
        match self.agent_type {
            AgentType::Solver => self.solve_problem(problem).await,
            AgentType::Analyzer => self.analyze_problem(problem).await,
            AgentType::Optimizer => self.optimize_solution(problem).await,
            AgentType::PatternMatcher => self.match_patterns(problem).await,
            AgentType::OutcomePredictor => self.predict_outcomes(problem).await,
            AgentType::ErrorAnalyzer => self.analyze_errors(problem).await,
            AgentType::PerformanceAnalyzer => self.analyze_performance(problem).await,
        }
    }

    async fn solve_problem(&self, problem: &str) -> anyhow::Result<String> {
        // Simulate problem solving with varying complexity
        let complexity = problem.len() % 3;
        sleep(Duration::from_millis(100 * (complexity as u64 + 1))).await;
        
        Ok(format!("Solution for '{}': Step-by-step approach with {} phases", 
            problem, complexity + 1))
    }

    async fn analyze_problem(&self, problem: &str) -> anyhow::Result<String> {
        sleep(Duration::from_millis(150)).await;
        
        let words: Vec<&str> = problem.split_whitespace().collect();
        Ok(format!("Analysis: {} components identified, complexity level: {}", 
            words.len(), 
            if words.len() > 10 { "high" } else { "medium" }))
    }

    async fn optimize_solution(&self, problem: &str) -> anyhow::Result<String> {
        sleep(Duration::from_millis(200)).await;
        
        Ok(format!("Optimized approach: Reduced complexity by 30% for '{}'", problem))
    }

    async fn match_patterns(&self, problem: &str) -> anyhow::Result<String> {
        let pool = self.db_pool.as_ref()
            .ok_or_else(|| anyhow::anyhow!("No database pool available"))?;
        
        // Look for similar patterns in the database
        let similar_patterns = self.find_similar_patterns(problem, pool).await?;
        
        Ok(format!("Pattern matching result: {}", similar_patterns))
    }

    async fn predict_outcomes(&self, problem: &str) -> anyhow::Result<String> {
        let pool = self.db_pool.as_ref()
            .ok_or_else(|| anyhow::anyhow!("No database pool available"))?;
        
        // Predict based on historical data
        let prediction = self.predict_from_history(problem, pool).await?;
        
        Ok(format!("Outcome prediction: {}", prediction))
    }

    async fn analyze_errors(&self, problem: &str) -> anyhow::Result<String> {
        let pool = self.db_pool.as_ref()
            .ok_or_else(|| anyhow::anyhow!("No database pool available"))?;
        
        // Analyze historical errors
        let error_analysis = self.analyze_historical_errors(problem, pool).await?;
        
        Ok(format!("Error analysis: {}", error_analysis))
    }

    async fn analyze_performance(&self, problem: &str) -> anyhow::Result<String> {
        let pool = self.db_pool.as_ref()
            .ok_or_else(|| anyhow::anyhow!("No database pool available"))?;
        
        // Analyze performance metrics
        let perf_analysis = self.analyze_performance_metrics(problem, pool).await?;
        
        Ok(format!("Performance analysis: {}", perf_analysis))
    }

    // Database helper methods
    async fn find_similar_patterns(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        // Parse the problem JSON to extract tool and params
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({ "tool": "unknown", "params": {} }));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Get historical success rates for similar commands
        let row = sqlx::query(
            r#"
            SELECT 
                COUNT(*) as total_attempts,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_attempts,
                AVG(duration) as avg_duration,
                GROUP_CONCAT(CASE WHEN success = 0 THEN error END) as failure_errors
            FROM command_patterns 
            WHERE tool = ?
            "#
        )
        .bind(tool)
        .fetch_one(pool)
        .await?;
        
        let total_attempts: i64 = row.get("total_attempts");
        let successful_attempts: Option<i64> = row.get("successful_attempts");
        let avg_duration: Option<f64> = row.get("avg_duration");
        let failure_errors: Option<String> = row.get("failure_errors");
        
        let success_rate = if total_attempts > 0 {
            successful_attempts.unwrap_or(0) as f64 / total_attempts as f64 * 100.0
        } else {
            0.0
        };
        
        let query_time = start_time.elapsed().as_millis();
        
        Ok(format!(
            "Found {} historical attempts for tool '{}' with {:.1}% success rate. Avg duration: {:.0}ms. Query time: {}ms",
            total_attempts,
            tool,
            success_rate,
            avg_duration.unwrap_or(0.0),
            query_time
        ))
    }

    async fn predict_from_history(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        // Parse task data
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({ "tool": "unknown", "params": {} }));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Get time-based patterns
        let current_hour = Utc::now().hour() as i32;
        let current_day = Utc::now().weekday().num_days_from_monday() as i32;
        
        let row = sqlx::query(
            r#"
            SELECT 
                COUNT(*) as attempts_at_time,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes_at_time,
                AVG(CASE WHEN success = 1 THEN duration END) as avg_success_duration
            FROM command_patterns 
            WHERE tool = ? 
                AND ABS(hour_of_day - ?) <= 2
                AND day_of_week = ?
            "#
        )
        .bind(tool)
        .bind(current_hour)
        .bind(current_day)
        .fetch_one(pool)
        .await?;
        
        let attempts_at_time: i64 = row.get("attempts_at_time");
        let successes_at_time: Option<i64> = row.get("successes_at_time");
        let avg_success_duration: Option<f64> = row.get("avg_success_duration");
        
        let time_success_rate = if attempts_at_time > 0 {
            successes_at_time.unwrap_or(0) as f64 / attempts_at_time as f64 * 100.0
        } else {
            0.0
        };
        
        let query_time = start_time.elapsed().as_millis();
        
        if attempts_at_time > 0 {
            Ok(format!(
                "Based on {} historical attempts at similar times, predicted success rate: {:.1}%. Expected duration: {:.0}ms. Query time: {}ms",
                attempts_at_time,
                time_success_rate,
                avg_success_duration.unwrap_or(0.0),
                query_time
            ))
        } else {
            Ok(format!("No historical data for this time period. Query time: {}ms", query_time))
        }
    }

    async fn analyze_historical_errors(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({ "tool": "unknown", "params": {} }));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Get common errors
        let rows = sqlx::query(
            r#"
            SELECT 
                error,
                COUNT(*) as error_count,
                MAX(timestamp) as last_occurrence
            FROM command_patterns 
            WHERE tool = ? AND success = 0 AND error IS NOT NULL
            GROUP BY error
            ORDER BY error_count DESC
            LIMIT 5
            "#
        )
        .bind(tool)
        .fetch_all(pool)
        .await?;
        
        let query_time = start_time.elapsed().as_millis();
        
        if rows.is_empty() {
            Ok(format!("No errors found for tool '{}'. Query time: {}ms", tool, query_time))
        } else {
            let mut error_summary = format!("Top errors for tool '{}': ", tool);
            for row in rows {
                let error: String = row.get("error");
                let count: i64 = row.get("error_count");
                error_summary.push_str(&format!("\n- {} ({}x)", error, count));
            }
            error_summary.push_str(&format!("\nQuery time: {}ms", query_time));
            Ok(error_summary)
        }
    }

    async fn analyze_performance_metrics(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({ "tool": "unknown", "params": {} }));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Get performance stats
        let row = sqlx::query(
            r#"
            SELECT 
                MIN(duration) as min_duration,
                MAX(duration) as max_duration,
                AVG(duration) as avg_duration,
                COUNT(DISTINCT params_hash) as unique_params,
                COUNT(*) as total_calls
            FROM command_patterns 
            WHERE tool = ? AND success = 1
            "#
        )
        .bind(tool)
        .fetch_one(pool)
        .await?;
        
        let min_duration: Option<f64> = row.get("min_duration");
        let max_duration: Option<f64> = row.get("max_duration");
        let avg_duration: Option<f64> = row.get("avg_duration");
        let unique_params: i64 = row.get("unique_params");
        let total_calls: i64 = row.get("total_calls");
        
        let query_time = start_time.elapsed().as_millis();
        
        Ok(format!(
            "Performance metrics for '{}': Min: {:.0}ms, Max: {:.0}ms, Avg: {:.0}ms. {} unique parameter sets across {} calls. Query time: {}ms",
            tool,
            min_duration.unwrap_or(0.0),
            max_duration.unwrap_or(0.0),
            avg_duration.unwrap_or(0.0),
            unique_params,
            total_calls,
            query_time
        ))
    }
}

// Batch operations for improved performance
pub async fn process_agent_batch(
    agents: Vec<EphemeralAgent>,
    problems: Vec<String>,
    pool: SqlitePool,
) -> Vec<anyhow::Result<String>> {
    let mut handles = Vec::new();
    
    for (mut agent, problem) in agents.into_iter().zip(problems.into_iter()) {
        let pool_clone = pool.clone();
        let handle = tokio::spawn(async move {
            let mut agent = agent.with_pool(pool_clone);
            agent.run(problem).await
        });
        handles.push(handle);
    }
    
    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(result) => results.push(result),
            Err(e) => results.push(Err(anyhow::anyhow!("Task panicked: {}", e))),
        }
    }
    
    results
}
EOF

# Backup original
cp swarm/src/agent.rs swarm/src/agent.rs.bak_queries

# Replace with fixed version
mv swarm/src/agent_fixed.rs swarm/src/agent.rs

echo "✅ Fixed SQLx queries in agent.rs"
echo "🔧 Now building the project..."

# Try to build
cd /home/cklose/ruv-fann-mcp1
cargo build --release 2>&1 | tee build_output.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed. Check build_output.log for details."
fi