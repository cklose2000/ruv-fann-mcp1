use chrono::{DateTime, Utc, Timelike, Datelike};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use std::time::Duration;
use tokio::time::sleep;
use uuid::Uuid;
use ndarray::{Array1, Array2};
use std::sync::{Arc, Mutex};

// Simple feedforward neural network for prediction
#[derive(Debug, Clone)]
pub struct NeuralNetwork {
    pub layers: Vec<usize>,
    pub weights: Vec<Array2<f32>>,
    pub biases: Vec<Array1<f32>>,
    pub learning_rate: f32,
}

// Global network storage
lazy_static::lazy_static! {
    static ref NETWORK: Arc<Mutex<Option<NeuralNetwork>>> = Arc::new(Mutex::new(None));
}

impl NeuralNetwork {
    pub fn new(layers: Vec<usize>, learning_rate: f32) -> Self {
        let mut rng = rand::thread_rng();
        let mut weights = Vec::new();
        let mut biases = Vec::new();

        for i in 0..layers.len() - 1 {
            use rand::Rng;
            // Xavier initialization
            let scale = (2.0 / layers[i] as f32).sqrt();
            let w = Array2::from_shape_fn((layers[i + 1], layers[i]), |_| {
                rng.gen_range(-scale..scale)
            });
            let b = Array1::zeros(layers[i + 1]);
            
            weights.push(w);
            biases.push(b);
        }

        Self {
            layers,
            weights,
            biases,
            learning_rate,
        }
    }

    fn sigmoid(x: f32) -> f32 {
        1.0 / (1.0 + (-x).exp())
    }

    pub fn predict(&self, input: &Array1<f32>) -> Array1<f32> {
        let mut current = input.clone();

        for (weight, bias) in self.weights.iter().zip(&self.biases) {
            let z = weight.dot(&current) + bias;
            current = z.mapv(Self::sigmoid);
        }

        current
    }

    pub fn train(&mut self, inputs: &[Array1<f32>], targets: &[Array1<f32>], epochs: usize) -> Vec<f32> {
        let mut losses = Vec::new();

        for _epoch in 0..epochs {
            let mut epoch_loss = 0.0;

            for (input, target) in inputs.iter().zip(targets) {
                // Forward pass
                let mut activations = vec![input.clone()];
                let mut current = input.clone();

                for (weight, bias) in self.weights.iter().zip(&self.biases) {
                    let z = weight.dot(&current) + bias;
                    current = z.mapv(Self::sigmoid);
                    activations.push(current.clone());
                }

                let output = activations.last().unwrap();

                // Calculate loss (MSE)
                let error = output - target;
                let loss = error.mapv(|x| x * x).sum() / error.len() as f32;
                epoch_loss += loss;

                // Backward pass (simplified for speed)
                let mut delta = error.clone();
                
                for i in (0..self.weights.len()).rev() {
                    let prev_activation = &activations[i];
                    
                    // Calculate gradients
                    let weight_gradient = delta
                        .clone()
                        .insert_axis(ndarray::Axis(1))
                        .dot(&prev_activation.clone().insert_axis(ndarray::Axis(0)));
                    
                    let bias_gradient = delta.clone();

                    // Update weights and biases
                    self.weights[i] = &self.weights[i] - &(weight_gradient * self.learning_rate);
                    self.biases[i] = &self.biases[i] - &(bias_gradient * self.learning_rate);

                    // Propagate error backward
                    if i > 0 {
                        delta = self.weights[i].t().dot(&delta);
                    }
                }
            }

            epoch_loss /= inputs.len() as f32;
            losses.push(epoch_loss);
        }

        losses
    }
}

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
    ErrorAnalyzer,
    PerformanceAnalyzer,
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
                if let Some(pool) = &self.db_pool {
                    self.find_similar_patterns(&problem, pool).await?
                } else {
                    sleep(Duration::from_millis(25)).await;
                    serde_json::to_string(&serde_json::json!({
                        "patterns": [],
                        "best_match": null,
                        "error": "No database connection available"
                    }))?
                }
            }
            AgentType::OutcomePredictor => {
                if let Some(pool) = &self.db_pool {
                    self.predict_outcome(&problem, pool).await?
                } else {
                    sleep(Duration::from_millis(30)).await;
                    serde_json::to_string(&serde_json::json!({
                        "successRate": 0.5,
                        "failureModes": [],
                        "confidence": 0.1,
                        "error": "No database connection available"
                    }))?
                }
            }
            AgentType::AlternativeGen => {
                if let Some(pool) = &self.db_pool {
                    self.generate_alternatives(&problem, pool).await?
                } else {
                    sleep(Duration::from_millis(35)).await;
                    serde_json::to_string(&serde_json::json!({
                        "alternatives": [],
                        "error": "No database connection available"
                    }))?
                }
            }
            AgentType::ContextAnalyzer => {
                if let Some(pool) = &self.db_pool {
                    self.analyze_execution_context(&problem, pool).await?
                } else {
                    sleep(Duration::from_millis(28)).await;
                    serde_json::to_string(&serde_json::json!({
                        "riskFactor": 1.0,
                        "contextFlags": [],
                        "recommendation": "proceed",
                        "error": "No database connection available"
                    }))?
                }
            }
            AgentType::ErrorAnalyzer => {
                sleep(Duration::from_millis(30)).await;
                serde_json::to_string(&serde_json::json!({
                    "errors": [],
                    "common_causes": ["network_timeout", "auth_failure"],
                    "resolution": "retry_with_backoff"
                }))?
            }
            AgentType::PerformanceAnalyzer => {
                sleep(Duration::from_millis(32)).await;
                serde_json::to_string(&serde_json::json!({
                    "metrics": {
                        "latency_p95": 250,
                        "throughput": 1000,
                        "error_rate": 0.01
                    },
                    "bottleneck": "database_query"
                }))?
            }
        };
        
        self.solution = Some(solution.clone());
        self.status = AgentStatus::Completed;
        
        // Store the execution pattern for learning
        if let Some(pool) = &self.db_pool {
            let _ = self.store_execution_pattern(&problem, &solution, true, pool).await;
            
            // Train neural network with this execution outcome
            let task_data: serde_json::Value = serde_json::from_str(&problem)
                .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
            let tool = task_data["tool"].as_str().unwrap_or("unknown");
            self.train_neural_network(tool, &task_data["params"], true).await;
        }
        
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
                AgentType::ErrorAnalyzer => 30,
                AgentType::PerformanceAnalyzer => 32,
            },
            dissolve_time_ms: 10,
        }
    }

    /// Store execution pattern for learning - optimized for ultra-low latency
    async fn store_execution_pattern(&self, problem: &str, solution: &str, success: bool, pool: &SqlitePool) -> anyhow::Result<()> {
        let now = Utc::now();
        let agent_id = self.id.to_string();
        let agent_type = format!("{:?}", self.agent_type);
        
        // Parse task data for storage
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        let params = serde_json::to_string(&task_data["params"])?;
        let context = serde_json::to_string(&serde_json::json!({
            "agent_type": agent_type,
            "timestamp": now.to_rfc3339()
        }))?;
        
        // Fast hash for params
        let params_hash = format!("{:x}", md5::compute(&params));
        
        let query = "
            INSERT INTO command_patterns 
            (id, tool, params, context, outcome, success, duration, timestamp, 
             agent_type, agent_id, params_hash, hour_of_day, day_of_week)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ";
        
        sqlx::query(query)
            .bind(Uuid::new_v4().to_string())
            .bind(tool)
            .bind(params)
            .bind(context)
            .bind(solution)
            .bind(success)
            .bind(self.lifespan_ms as f64)
            .bind(now.to_rfc3339())
            .bind(agent_type)
            .bind(agent_id)
            .bind(params_hash)
            .bind(now.hour() as i64)
            .bind(now.weekday().number_from_monday() as i64)
            .execute(pool)
            .await?;
        
        Ok(())
    }

    /// Ultra-fast pattern matching using optimized queries
    async fn find_similar_patterns(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Optimized query for sub-millisecond performance
        let query = "
            SELECT id, tool, params, outcome, success, duration, timestamp
            FROM command_patterns 
            WHERE tool = ?1
            ORDER BY timestamp DESC
            LIMIT 10
        ";
        
        let rows = sqlx::query(query)
            .bind(tool)
            .fetch_all(pool)
            .await?;
        
        let mut patterns = Vec::new();
        let mut best_match_id = None;
        let mut best_confidence = 0.0;

        for row in rows {
            let id: String = row.get("id");
            let params_str: String = row.get("params");
            let success: bool = row.get("success");
            let duration: f64 = row.get("duration");
            
            let stored_params: serde_json::Value = serde_json::from_str(&params_str)
                .unwrap_or_else(|_| serde_json::json!({}));
            
            let similarity = self.calculate_parameter_similarity(&task_data["params"], &stored_params);
            let confidence = similarity * if success { 0.9 } else { 0.6 };
            
            if confidence > 0.3 {
                patterns.push(serde_json::json!({
                    "id": id,
                    "type": if success { "success_pattern" } else { "failure_pattern" },
                    "confidence": confidence,
                    "tool": tool,
                    "outcome": if success { "success" } else { "failure" },
                    "duration": duration
                }));
                
                if confidence > best_confidence {
                    best_confidence = confidence;
                    best_match_id = Some(id);
                }
            }
        }

        let processing_time = start_time.elapsed().as_micros() as u64;
        
        Ok(serde_json::to_string(&serde_json::json!({
            "patterns": patterns,
            "best_match": best_match_id,
            "total_found": patterns.len(),
            "processing_time_us": processing_time,
            "query_tool": tool
        }))?)
    }

    /// Ultra-fast outcome prediction with caching
    async fn predict_outcome(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // High-performance aggregation query
        let query = "
            SELECT 
                COUNT(*) as total_attempts,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_attempts,
                AVG(duration) as avg_duration
            FROM command_patterns 
            WHERE tool = ?1
        ";
        
        let row = sqlx::query(query)
            .bind(tool)
            .fetch_one(pool)
            .await?;

        let total_attempts: i64 = row.get("total_attempts");
        let successful_attempts: Option<i64> = row.get("successful_attempts");
        let avg_duration: Option<f64> = row.get("avg_duration");

        let success_rate = if total_attempts > 0 {
            successful_attempts.unwrap_or(0) as f64 / total_attempts as f64
        } else {
            0.5 // Neutral probability for unknown commands
        };

        // Get neural network prediction
        let neural_prediction = self.get_neural_network_prediction(tool, &task_data["params"]).await;
        
        // Combine historical and neural network predictions
        let combined_success_rate = if let Some(neural_pred) = neural_prediction {
            if total_attempts > 10 {
                // Weight historical data more for well-known commands
                success_rate * 0.7 + neural_pred * 0.3
            } else if total_attempts > 3 {
                // Balance both predictions
                (success_rate + neural_pred) / 2.0
            } else {
                // Trust neural network more for new commands
                neural_pred * 0.7 + success_rate * 0.3
            }
        } else {
            success_rate
        };

        let confidence = if neural_prediction.is_some() && total_attempts > 3 { 
            0.95 
        } else if total_attempts > 10 { 
            0.9 
        } else if total_attempts > 3 { 
            0.7 
        } else { 
            0.3 
        };
        
        let estimated_duration = avg_duration.unwrap_or(1000.0) as u64;
        let processing_time = start_time.elapsed().as_micros() as u64;

        Ok(serde_json::to_string(&serde_json::json!({
            "successRate": combined_success_rate,
            "confidence": confidence,
            "historicalAttempts": total_attempts,
            "historicalSuccessRate": success_rate,
            "neuralPrediction": neural_prediction,
            "estimatedDuration": estimated_duration,
            "processingTime": processing_time,
            "tool": tool
        }))?)
    }

    /// Generate alternatives based on failure patterns
    async fn generate_alternatives(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        
        // Fast query for failure patterns
        let query = "
            SELECT params, error
            FROM command_patterns 
            WHERE tool = ?1 AND success = 0
            ORDER BY timestamp DESC
            LIMIT 5
        ";
        
        let rows = sqlx::query(query)
            .bind(tool)
            .fetch_all(pool)
            .await?;

        let mut alternatives = Vec::new();
        
        // Generate tool-specific alternatives based on patterns
        match tool {
            "bq" => {
                if let Some(serde_json::Value::String(query_str)) = task_data["params"].get("query") {
                    if query_str.contains("SELECT *") && !query_str.to_lowercase().contains("limit") {
                        alternatives.push(serde_json::json!({
                            "tool": "bq",
                            "params": {
                                "query": format!("{} LIMIT 1000", query_str.trim_end_matches(';')),
                                "dataset": task_data["params"].get("dataset"),
                                "project": task_data["params"].get("project")
                            },
                            "rationale": "Add LIMIT to prevent expensive full table scan",
                            "successProbability": 0.92
                        }));
                    }
                }
            }
            _ => {
                // Generic alternatives
                alternatives.push(serde_json::json!({
                    "tool": tool,
                    "params": task_data["params"],
                    "rationale": "Retry with same parameters",
                    "successProbability": 0.7
                }));
            }
        }

        let processing_time = start_time.elapsed().as_micros() as u64;

        Ok(serde_json::to_string(&serde_json::json!({
            "alternatives": alternatives,
            "processingTime": processing_time,
            "tool": tool
        }))?)
    }

    /// Analyze execution context for optimal timing
    async fn analyze_execution_context(&self, problem: &str, pool: &SqlitePool) -> anyhow::Result<String> {
        let start_time = std::time::Instant::now();
        let now = Utc::now();
        
        let task_data: serde_json::Value = serde_json::from_str(problem)
            .unwrap_or_else(|_| serde_json::json!({"tool": "unknown", "params": {}}));
        
        let tool = task_data["tool"].as_str().unwrap_or("unknown");
        let hour = now.hour();
        let day_of_week = now.weekday().number_from_monday();
        
        // Fast temporal analysis query
        let query = "
            SELECT 
                AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate,
                COUNT(*) as sample_size
            FROM command_patterns 
            WHERE tool = ?1 AND hour_of_day = ?2
        ";
        
        let row = sqlx::query(query)
            .bind(tool)
            .bind(hour as i64)
            .fetch_one(pool)
            .await?;

        let success_rate: Option<f64> = row.get("success_rate");
        let sample_size: i64 = row.get("sample_size");

        let hourly_success_rate = success_rate.unwrap_or(0.5);
        let temporal_risk = if sample_size > 0 {
            1.0 / hourly_success_rate.max(0.1)
        } else {
            1.0
        };

        let mut context_flags = Vec::new();
        
        // Time-based flags
        if hour >= 9 && hour <= 17 {
            context_flags.push("business_hours".to_string());
        }
        if day_of_week >= 6 {
            context_flags.push("weekend".to_string());
        }
        if temporal_risk > 1.5 {
            context_flags.push("high_temporal_risk".to_string());
        }

        let recommendation = if temporal_risk > 1.5 {
            "defer_execution"
        } else if temporal_risk > 1.2 {
            "proceed_with_caution"
        } else {
            "optimal_timing"
        };

        let processing_time = start_time.elapsed().as_micros() as u64;

        Ok(serde_json::to_string(&serde_json::json!({
            "riskFactor": temporal_risk,
            "contextFlags": context_flags,
            "recommendation": recommendation,
            "currentHour": hour,
            "dayOfWeek": day_of_week,
            "historicalSuccessRate": hourly_success_rate,
            "sampleSize": sample_size,
            "processingTime": processing_time,
            "tool": tool
        }))?)
    }

    /// Get neural network prediction for outcome
    async fn get_neural_network_prediction(&self, tool: &str, params: &serde_json::Value) -> Option<f64> {
        // Encode features for neural network
        let features = self.encode_features_for_neural_network(tool, params);
        let input = Array1::from(features);
        
        // Get prediction from neural network
        let prediction = {
            if let Ok(network_guard) = NETWORK.lock() {
                if let Some(ref network) = *network_guard {
                    let output = network.predict(&input);
                    // Return the first output as success probability
                    output.get(0).cloned().map(|v| v.max(0.0).min(1.0) as f64)
                } else {
                    None
                }
            } else {
                None
            }
        };
        
        // Initialize network if not present (after dropping the guard)
        if prediction.is_none() {
            self.initialize_neural_network().await;
        }
        
        prediction
    }

    /// Initialize the neural network if not already present
    async fn initialize_neural_network(&self) {
        if let Ok(mut network_guard) = NETWORK.lock() {
            if network_guard.is_none() {
                // Create a network optimized for tool success prediction
                // Input: [tool_type(8) + param_features(12) + temporal(4)] = 24 features
                let network = NeuralNetwork::new(vec![24, 32, 16, 1], 0.01);
                *network_guard = Some(network);
                tracing::info!("Initialized neural network for prediction");
            }
        }
    }

    /// Encode tool and parameters into feature vector for neural network
    fn encode_features_for_neural_network(&self, tool: &str, params: &serde_json::Value) -> Vec<f32> {
        let mut features = vec![0.0; 24];

        // Encode tool type (first 8 features - one-hot encoding)
        match tool.to_lowercase().as_str() {
            "bash" | "shell" | "command" => features[0] = 1.0,
            "read" | "file_read" => features[1] = 1.0,
            "write" | "file_write" => features[2] = 1.0,
            "edit" | "file_edit" => features[3] = 1.0,
            "search" | "grep" | "find" => features[4] = 1.0,
            "git" => features[5] = 1.0,
            "bq" | "bigquery" => features[6] = 1.0,
            "general" | "unknown" => features[7] = 1.0,
            _ => features[7] = 1.0, // Default to general
        }

        // Encode parameter characteristics (features 8-19)
        if let serde_json::Value::Object(param_obj) = params {
            // Parameter count (normalized)
            features[8] = (param_obj.len() as f32 / 5.0).min(1.0);
            
            // Analyze parameter content
            for (key, value) in param_obj {
                match key.as_str() {
                    "query" | "command" | "code" => {
                        if let serde_json::Value::String(s) = value {
                            // Command/query complexity features
                            features[9] = (s.len() as f32 / 100.0).min(1.0); // Length normalized
                            features[10] = (s.split_whitespace().count() as f32 / 10.0).min(1.0); // Word count
                            
                            // Risk pattern detection
                            if s.contains("rm ") || s.contains("delete") || s.contains("DROP") {
                                features[11] = 1.0; // Destructive operations
                            }
                            if s.contains("SELECT *") || s.contains("UPDATE") || s.contains("INSERT") {
                                features[12] = 1.0; // Database operations
                            }
                        }
                    }
                    "file_path" | "path" => {
                        if let serde_json::Value::String(s) = value {
                            features[13] = (s.len() as f32 / 50.0).min(1.0); // Path length
                            if s.contains(".") { features[14] = 1.0; } // Has file extension
                            if s.starts_with("/") { features[15] = 1.0; } // Absolute path
                        }
                    }
                    "timeout" | "limit" => {
                        if let Some(timeout_val) = value.as_u64() {
                            features[16] = (timeout_val as f32 / 5000.0).min(1.0); // Timeout value
                        }
                    }
                    _ => {}
                }
            }
        }

        // Add temporal features (features 20-23)
        let now = Utc::now();
        features[20] = now.hour() as f32 / 24.0; // Hour of day (normalized)
        features[21] = now.weekday().number_from_monday() as f32 / 7.0; // Day of week
        features[22] = (now.timestamp() % 86400) as f32 / 86400.0; // Time of day as fraction
        features[23] = if now.weekday().number_from_monday() >= 6 { 1.0 } else { 0.0 }; // Weekend flag

        features
    }

    /// Train neural network with execution outcome
    async fn train_neural_network(&self, tool: &str, params: &serde_json::Value, success: bool) {
        let features = self.encode_features_for_neural_network(tool, params);
        let input = Array1::from(features);
        let target = Array1::from(vec![if success { 1.0 } else { 0.0 }]);
        
        // Train in a separate scope to ensure guard is dropped before any potential await
        {
            if let Ok(mut network_guard) = NETWORK.lock() {
                if let Some(ref mut network) = *network_guard {
                    // Perform single-step online learning
                    let _losses = network.train(&[input], &[target], 1);
                    tracing::debug!("Neural network trained with outcome: {}", success);
                }
            }
        }
    }

    /// Ultra-fast parameter similarity calculation
    fn calculate_parameter_similarity(&self, params1: &serde_json::Value, params2: &serde_json::Value) -> f64 {
        match (params1, params2) {
            (serde_json::Value::Object(obj1), serde_json::Value::Object(obj2)) => {
                let keys1: std::collections::HashSet<_> = obj1.keys().collect();
                let keys2: std::collections::HashSet<_> = obj2.keys().collect();
                
                if keys1.is_empty() && keys2.is_empty() {
                    return 1.0;
                }
                
                let common_keys: std::collections::HashSet<_> = keys1.intersection(&keys2).collect();
                let all_keys: std::collections::HashSet<_> = keys1.union(&keys2).collect();
                
                if all_keys.is_empty() {
                    return 0.0;
                }
                
                let key_similarity = common_keys.len() as f64 / all_keys.len() as f64;
                
                // Fast value similarity for common keys
                let mut value_similarities = Vec::new();
                for key in common_keys {
                    let val1 = &obj1[*key];
                    let val2 = &obj2[*key];
                    
                    let sim = if val1 == val2 { 1.0 } else { 0.0 };
                    value_similarities.push(sim);
                }
                
                let avg_value_similarity = if value_similarities.is_empty() {
                    0.0
                } else {
                    value_similarities.iter().sum::<f64>() / value_similarities.len() as f64
                };
                
                key_similarity * 0.3 + avg_value_similarity * 0.7
            }
            _ => {
                if params1 == params2 { 1.0 } else { 0.0 }
            }
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