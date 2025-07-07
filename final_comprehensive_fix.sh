#!/bin/bash

echo "🚀 Comprehensive fix for ruv-fann-mcp1..."

cd /home/cklose/ruv-fann-mcp1

# First, let's restore the original agent.rs from backup and apply targeted fixes
echo "📦 Restoring original agent.rs and applying targeted fixes..."
cp backup/agent.rs.bak swarm/src/agent.rs

# Create a sed script to fix the SQLx queries without changing the structure
cat > fix_sqlx_queries.sed << 'EOF'
# Fix query! macros to use regular query with proper bindings
/sqlx::query!(/,/)/ {
    s/sqlx::query!/sqlx::query/g
}

# Add Row import if not present
1s/^/use sqlx::Row;\n/

EOF

# Apply the fixes
sed -i -f fix_sqlx_queries.sed swarm/src/agent.rs

# Now let's fix the main.rs issue
echo "🔧 Fixing main.rs..."
sed -i 's/SwarmCoordinator::new(pool).await?/SwarmCoordinator::new(pool)/' swarm/src/main.rs
sed -i 's/coordinator.set_max_agents(n).await;/coordinator.set_max_agents(n);/' swarm/src/main.rs

# Create a minimal patch to add missing AgentStatus variant
echo "🔧 Adding missing AgentStatus variant..."
sed -i '/pub enum AgentStatus {/,/}/ s/Failed,/Failed,\n    Solving,/' swarm/src/agent.rs

# Let's also create a more surgical fix for the query! macros
echo "🔧 Creating surgical SQLx fix..."
cat > swarm/src/sqlx_fix.patch << 'EOF'
--- a/swarm/src/agent.rs
+++ b/swarm/src/agent.rs
@@ -1,4 +1,5 @@
 use chrono::{DateTime, Utc, Timelike, Datelike};
 use serde::{Deserialize, Serialize};
+use sqlx::Row;
 use sqlx::SqlitePool;
 use std::time::Duration;
@@ -432,7 +433,7 @@ impl EphemeralAgent {
         let params = &task_data["params"];
 
         // Get historical success rates for similar commands
-        let historical_stats = sqlx::query!(
+        let historical_stats = sqlx::query(
             r#"
             SELECT 
                 COUNT(*) as total_attempts,
@@ -442,17 +443,21 @@ impl EphemeralAgent {
             FROM command_patterns 
             WHERE tool = ?
             "#,
-            tool
         )
+        .bind(tool)
         .fetch_one(pool)
         .await?;
         
-        let success_rate = if historical_stats.total_attempts > 0 {
-            (historical_stats.successful_attempts.unwrap_or(0) as f64 / historical_stats.total_attempts as f64) * 100.0
+        let total_attempts: i64 = historical_stats.get("total_attempts");
+        let successful_attempts: Option<i64> = historical_stats.get("successful_attempts");
+        let avg_duration: Option<f64> = historical_stats.get("avg_duration");
+        
+        let success_rate = if total_attempts > 0 {
+            (successful_attempts.unwrap_or(0) as f64 / total_attempts as f64) * 100.0
         } else {
             0.0
         };
-        let avg_duration = historical_stats.avg_duration.unwrap_or(0.0);
+        let avg_duration = avg_duration.unwrap_or(0.0);
         
         let query_time = start_time.elapsed().as_millis();
         
@@ -475,7 +480,7 @@ impl EphemeralAgent {
         let current_hour = Utc::now().hour() as i32;
         let current_day = Utc::now().weekday().num_days_from_monday() as i32;
         
-        let time_stats = sqlx::query!(
+        let time_stats = sqlx::query(
             r#"
             SELECT 
                 COUNT(*) as attempts_at_time,
@@ -485,18 +490,19 @@ impl EphemeralAgent {
             WHERE tool = ? 
                 AND ABS(hour_of_day - ?) <= 2
                 AND day_of_week = ?
-            "#,
-            tool,
-            current_hour,
-            current_day
+            "#
         )
+        .bind(tool)
+        .bind(current_hour)
+        .bind(current_day)
         .fetch_one(pool)
         .await?;
         
-        let time_success_rate = if time_stats.attempts_at_time > 0 {
-            (time_stats.successes_at_time.unwrap_or(0) as f64 / time_stats.attempts_at_time as f64) * 100.0
+        let attempts_at_time: i64 = time_stats.get("attempts_at_time");
+        let time_success_rate = if attempts_at_time > 0 {
+            (time_stats.get::<Option<i64>, _>("successes_at_time").unwrap_or(0) as f64 / attempts_at_time as f64) * 100.0
         } else {
             0.0
         };
EOF

# Apply the patch
patch -p1 < swarm/src/sqlx_fix.patch

echo "✅ All fixes applied!"
echo "🔧 Building project..."

cargo build --release 2>&1 | tee final_build.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Starting swarm service..."
    pkill -f ruv-swarm || true
    ./target/release/ruv-swarm --minimal --agents 2 > swarm.log 2>&1 &
    echo "✅ Swarm service started!"
    sleep 2
    curl -s http://localhost:3001/health && echo " - Health check passed!"
else
    echo "❌ Build failed. Checking errors..."
    grep "error\[E" final_build.log | head -20
fi