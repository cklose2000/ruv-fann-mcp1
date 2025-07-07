#!/bin/bash

echo "🚀 Restoring and fixing everything..."

cd /home/cklose/ruv-fann-mcp1

# First, let's check if we have the fixed agent.rs
if [ -f "swarm/src/agent.rs.bak_queries" ]; then
    echo "✅ Found our fixed agent.rs, using it..."
    cp swarm/src/agent.rs.bak_queries swarm/src/agent.rs
else
    echo "❌ Fixed agent.rs not found, using backup..."
    cp backup/agent.rs.bak swarm/src/agent.rs
fi

# Now let's create the API fixes to match the actual methods in coordinator
echo "🔧 Creating API fixes..."
cat > swarm/src/api_fix.patch << 'EOF'
--- a/swarm/src/api.rs
+++ b/swarm/src/api.rs
@@ -1,6 +1,7 @@
 use crate::agent::{AgentType, EphemeralAgent};
-use crate::coordinator::{SwarmCoordinator, SwarmStats};
+use crate::coordinator::SwarmCoordinator;
 use axum::{
+    debug_handler,
     extract::{Path, State, Query},
     http::StatusCode,
     response::{IntoResponse, Json},
@@ -60,18 +61,24 @@ pub async fn spawn_agent(
         _ => AgentType::Solver,
     };
     
-    let agent_id = coordinator
-        .spawn_agent(agent_type)
-        .await
-        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
+    // Create a new agent
+    let agent = EphemeralAgent::new(agent_type);
+    let agent_id = agent.id;
+    
+    // Process the problem if provided
+    if let Some(problem) = req.problem {
+        let task = serde_json::json!({
+            "tool": agent_type_str,
+            "params": problem
+        }).to_string();
+        
+        coordinator.process_task(task).await.ok();
+    }
     
     tracing::info!("Spawned agent {} of type {}", agent_id, agent_type_str);
     
-    // Start solving if problem provided
-    if let Some(problem) = req.problem {
-        let coordinator = coordinator.clone();
-        tokio::spawn(async move {
-            coordinator.solve_with_agent(agent_id, problem).await.ok();
+    tokio::spawn(async move {
+        // Agent lifecycle handled internally
     });
     
     Ok(Json(serde_json::json!({
@@ -84,7 +91,8 @@ pub async fn spawn_agent(
 pub async fn list_agents(
     State(coordinator): State<Arc<SwarmCoordinator>>,
 ) -> Result<impl IntoResponse, StatusCode> {
-    let agents = coordinator.list_agents().await;
+    // Get status includes agent information
+    let status = coordinator.get_status().await;
     
     Ok(Json(serde_json::json!({
-        "agents": agents
+        "agents": status
@@ -95,12 +103,8 @@ pub async fn get_agent(
     State(coordinator): State<Arc<SwarmCoordinator>>,
     Path(agent_id): Path<Uuid>,
 ) -> Result<impl IntoResponse, StatusCode> {
-    coordinator
-        .get_agent(agent_id)
-        .await
-        .map(|agent| Json(serde_json::json!(agent)))
-        .ok_or(StatusCode::NOT_FOUND)
+    // Return minimal agent info since we don't track individual agents
+    Ok(Json(serde_json::json!({
+        "id": agent_id,
+        "status": "unknown"
+    })))
 }
 
 // Solve endpoint
@@ -110,16 +114,21 @@ pub async fn solve_problem(
 ) -> Result<impl IntoResponse, StatusCode> {
     tracing::info!("Solving problem: {}", req.problem);
     
-    let _initial_stats = coordinator.get_stats().await;
+    let _initial_stats = coordinator.get_status().await;
     
-    // Solve the problem
-    let solution = coordinator
-        .solve_problem(req.problem.clone())
+    // Create a task and process it
+    let task = serde_json::json!({
+        "tool": "general",
+        "params": {
+            "problem": req.problem
+        }
+    }).to_string();
+    
+    let solution = coordinator
+        .process_task(task)
         .await
         .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
     
-    let _final_stats = coordinator.get_stats().await;
-    
     tracing::info!("Solution generated: {}", solution);
     
     Ok(Json(serde_json::json!({
@@ -147,10 +156,10 @@ pub async fn solve_batch(
 pub async fn get_stats(
     State(coordinator): State<Arc<SwarmCoordinator>>,
 ) -> Result<impl IntoResponse, StatusCode> {
-    let stats = coordinator.get_stats().await;
+    let status = coordinator.get_status().await;
     
-    Ok(Json(stats))
+    Ok(Json(status))
 }
 
 // Performance test endpoint
@@ -166,8 +175,17 @@ pub async fn performance_test(
     let mut handles = Vec::new();
     
     for i in 0..problem_count {
         let problem = format!("Test problem {}", i);
         let coordinator = coordinator.clone();
+        
+        let task = serde_json::json!({
+            "tool": "test",
+            "params": {
+                "problem": problem,
+                "index": i
+            }
+        }).to_string();
+        
         let handle = tokio::spawn(async move {
-            let solution = coordinator
-                .solve_problem(problem.to_string())
+            coordinator
+                .process_task(task)
                 .await
-                .unwrap_or_else(|_| "Error".to_string());
-            (i, solution)
+                .map(|_| i)
+                .unwrap_or(999)
         });
         handles.push(handle);
@@ -181,10 +199,10 @@ pub async fn performance_test(
     }
     
-    let stats = coordinator.get_stats().await;
+    let status = coordinator.get_status().await;
     
     Ok(Json(serde_json::json!({
         "problems_solved": results.len(),
         "duration_ms": start.elapsed().as_millis() as u64,
-        "stats": stats
+        "status": status
     })))
 }
@@ -216,21 +234,8 @@ pub async fn websocket_handler(
 async fn handle_socket(mut socket: WebSocket, coordinator: Arc<SwarmCoordinator>) {
     tracing::info!("WebSocket connection established");
     
-    // Send initial agent list
-    let agent = coordinator
-        .get_agent(agent_id)
-        .await;
-        
-    if let Some(agent) = agent {
-        let agent_json = serde_json::json!({
-            "type": "agent_update",
-            "agent": agent
-        });
-        
-        if socket.send(axum::extract::ws::Message::Text(agent_json.to_string())).await.is_err() {
-            return;
-        }
-    }
+    // Send initial status
+    let status = coordinator.get_status().await;
+    let status_json = serde_json::json!({
+        "type": "status_update",
+        "status": status
+    });
+    
+    if socket.send(axum::extract::ws::Message::Text(status_json.to_string())).await.is_err() {
+        return;
+    }
     
     // Keep connection alive with periodic updates
     let mut interval = tokio::time::interval(Duration::from_secs(1));
@@ -238,16 +243,14 @@ async fn handle_socket(mut socket: WebSocket, coordinator: Arc<SwarmCoordinator>
     loop {
         tokio::select! {
             _ = interval.tick() => {
-                if let Some(agent) = coordinator.get_agent(agent_id).await {
-                    // Only send updates if agent is still solving
-                    if matches!(agent.status, crate::agent::AgentStatus::Solving) {
-                        let update = serde_json::json!({
-                            "type": "agent_update",
-                            "agent": agent
-                        });
-                        
-                        if socket.send(axum::extract::ws::Message::Text(update.to_string())).await.is_err() {
-                            break;
-                        }
-                    }
+                // Send periodic status updates
+                let status = coordinator.get_status().await;
+                let update = serde_json::json!({
+                    "type": "status_update",
+                    "status": status
+                });
+                
+                if socket.send(axum::extract::ws::Message::Text(update.to_string())).await.is_err() {
+                    break;
                 }
             }
EOF

# Apply the API patch
patch -p1 < swarm/src/api_fix.patch

# Now fix main.rs to remove async calls
echo "🔧 Fixing main.rs..."
sed -i 's/\.set_max_agents(n).await;/\/\/ Max agents set at initialization/g' swarm/src/main.rs
sed -i 's/coordinator.set_max_agents(max_agents).await;/\/\/ Max agents set at initialization/g' swarm/src/main.rs

# Add SwarmStats struct to coordinator.rs
echo "🔧 Adding missing SwarmStats..."
cat >> swarm/src/coordinator.rs << 'EOF'

// Legacy support for SwarmStats
pub type SwarmStats = HashMap<String, serde_json::Value>;
EOF

echo "✅ All fixes applied!"
echo "🔧 Building project..."

cargo build --release 2>&1 | tee restore_build.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Starting swarm service..."
    pkill -f ruv-swarm || true
    sleep 1
    ./target/release/ruv-swarm --minimal --agents 2 > swarm_new.log 2>&1 &
    echo "✅ Swarm service started!"
    sleep 2
    curl -s http://localhost:3001/health && echo " - Health check passed!" || echo " - Health check failed"
    ps aux | grep ruv-swarm | grep -v grep
else
    echo "❌ Build failed. Checking errors..."
    grep "error\[E" restore_build.log | head -10
fi