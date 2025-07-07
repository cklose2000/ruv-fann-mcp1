#!/bin/bash
# Comprehensive fix for all SQLx query issues

echo "🔧 Fixing all SQLx query syntax issues..."

cd /home/cklose/ruv-fann-mcp1/swarm/src

# Create backup
cp agent.rs agent.rs.bak3

# Step 1: Fix query syntax - remove the extra parameter
echo "Step 1: Fixing query parameter syntax..."
sed -i 's/sqlx::query(\(.*\)"#,$/sqlx::query(\1"#)/g' agent.rs
sed -i '/^[[:space:]]*tool[[:space:]]*$/d' agent.rs

# Step 2: Add .bind(tool) after each query
echo "Step 2: Adding .bind() calls..."
# For queries that need tool binding
sed -i '/sqlx::query(/{N;s/\(sqlx::query(.*"#)\)\s*)/\1)\n        .bind(tool)/}' agent.rs

# Step 3: Add use sqlx::Row at the top of the file
echo "Step 3: Adding necessary imports..."
sed -i '1s/^/use sqlx::Row;\n/' agent.rs

# Step 4: Replace field access with Row::get calls
echo "Step 4: Fixing field access to use Row::get..."

# Fix simple field accesses like cmd.params
sed -i 's/cmd\.params/cmd.get("params")/g' agent.rs
sed -i 's/cmd\.success/cmd.get("success")/g' agent.rs
sed -i 's/cmd\.id/cmd.get("id")/g' agent.rs
sed -i 's/cmd\.tool/cmd.get("tool")/g' agent.rs
sed -i 's/cmd\.duration/cmd.get("duration")/g' agent.rs
sed -i 's/cmd\.timestamp/cmd.get("timestamp")/g' agent.rs

# Fix for historical_stats fields
sed -i 's/historical_stats\.total_attempts/historical_stats.get("total_attempts")/g' agent.rs
sed -i 's/historical_stats\.successful_attempts/historical_stats.get("successful_attempts")/g' agent.rs
sed -i 's/historical_stats\.avg_duration/historical_stats.get("avg_duration")/g' agent.rs
sed -i 's/historical_stats\.failure_errors/historical_stats.get("failure_errors")/g' agent.rs

# Fix for stat fields
sed -i 's/stat\.hour/stat.get("hour")/g' agent.rs
sed -i 's/stat\.total/stat.get("total")/g' agent.rs
sed -i 's/stat\.successes/stat.get("successes")/g' agent.rs

# Fix for recent_stats fields
sed -i 's/recent_stats\.recent_failures/recent_stats.get("recent_failures")/g' agent.rs
sed -i 's/recent_stats\.recent_total/recent_stats.get("recent_total")/g' agent.rs
sed -i 's/recent_stats\.week_failures/recent_stats.get("week_failures")/g' agent.rs
sed -i 's/recent_stats\.week_total/recent_stats.get("week_total")/g' agent.rs

# Fix for system_performance fields
sed -i 's/system_performance\.avg_duration/system_performance.get("avg_duration")/g' agent.rs
sed -i 's/historical_avg\.avg_duration/historical_avg.get("avg_duration")/g' agent.rs

# Fix for failure fields
sed -i 's/failure\.params/failure.get("params")/g' agent.rs
sed -i 's/failure\.error/failure.get("error")/g' agent.rs
sed -i 's/failure\.timestamp/failure.get("timestamp")/g' agent.rs

# Fix for similar_successes fields
sed -i 's/similar_successes\.total/similar_successes.get("total")/g' agent.rs
sed -i 's/similar_successes\.successes/similar_successes.get("successes")/g' agent.rs

echo "✅ All SQLx syntax issues fixed!"
echo ""
echo "Note: This is an automated fix. Some manual adjustments might still be needed."
echo "Original file backed up to: agent.rs.bak3"
echo ""
echo "You can now run: cargo build --release"