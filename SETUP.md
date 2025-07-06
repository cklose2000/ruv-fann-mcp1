# ruv-FANN MCP Server Setup Guide

## Overview

The ruv-FANN MCP Server provides intelligent pattern learning and prediction capabilities for Claude Code, helping prevent repeated failures and suggesting optimal approaches based on learned patterns.

## Prerequisites

- Rust 1.70+ (for ruv-FANN backend)
- Node.js 16+ (for MCP server)
- SQLite3
- Git

## Installation

### 1. Clone and Build ruv-FANN Backend

```bash
# Clone the repository
git clone <repository-url>
cd ruv-fann-mcp1

# Build Rust components
cargo build --release
```

### 2. Install MCP Server Dependencies

```bash
cd mcp-server
npm install
```

### 3. Build MCP Server

```bash
npm run build
```

## Running the System

### 1. Start ruv-FANN Backend Services

You need to run three backend services in separate terminals:

**Terminal 1: Neural Network Core**
```bash
PORT=8090 ./target/release/ruv-fann-core
```

**Terminal 2: Swarm Coordinator**
```bash
# Start with 10 pattern analysis agents
./target/release/ruv-swarm --minimal --agents 10
```

**Terminal 3: Model Server**
```bash
./target/release/model-server
```

### 2. Start the MCP Server

**Terminal 4: MCP Server**
```bash
cd mcp-server
npm start
```

The MCP server will connect to the backend services and start listening for MCP protocol messages via stdio.

## Configuration

### Environment Variables

Create a `.env` file in the `mcp-server` directory:

```env
# ruv-FANN service URLs
RUV_FANN_CORE_URL=http://localhost:8090
RUV_FANN_SWARM_URL=http://localhost:8081
RUV_FANN_MODEL_URL=http://localhost:8082

# Logging level
LOG_LEVEL=info
```

### Claude Code Configuration

Add the MCP server to your Claude Code configuration:

```json
{
  "mcpServers": {
    "ruv-fann": {
      "command": "node",
      "args": ["/path/to/ruv-fann-mcp1/mcp-server/dist/index.js"],
      "env": {
        "RUV_FANN_CORE_URL": "http://localhost:8090",
        "RUV_FANN_SWARM_URL": "http://localhost:8081",
        "RUV_FANN_MODEL_URL": "http://localhost:8082"
      }
    }
  }
}
```

## Usage

### Available MCP Tools

1. **predict_outcome** - Predict command success/failure probability
   ```json
   {
     "tool": "bq query",
     "params": { "query": "SELECT * FROM table" },
     "context": { "projectType": "analytics" }
   }
   ```

2. **learn_pattern** - Record command execution outcome
   ```json
   {
     "tool": "git push",
     "params": { "branch": "main" },
     "outcome": "failure",
     "duration": 2500,
     "error": "non-fast-forward"
   }
   ```

3. **get_suggestions** - Get alternative command suggestions
   ```json
   {
     "tool": "gcloud",
     "params": { "command": "compute instances list" },
     "goal": "List running instances"
   }
   ```

### Pattern Learning

The system automatically learns from:
- Command execution patterns
- Success/failure rates
- Common error messages
- Execution timing
- Command sequences

### Predictions

When Claude Code attempts a command, the MCP server:
1. Spawns ephemeral analysis agents
2. Checks historical patterns
3. Predicts success probability
4. Suggests alternatives if failure likely
5. Returns predictions in <50ms

## Testing

### Basic Connectivity Test

```bash
cd mcp-server
node test-mcp.js
```

### Manual Testing with curl

Test the backend services directly:

```bash
# Check swarm health
curl http://localhost:8081/health

# Check neural network core
curl http://localhost:8090/health

# Check model server
curl http://localhost:8082/health
```

## Monitoring

### View Logs

MCP server logs are written to `mcp-server/mcp-server.log`

### Pattern Database

View learned patterns:
```bash
sqlite3 mcp-server/data/patterns.db "SELECT * FROM learned_patterns;"
```

### System Statistics

Access via MCP resource:
```
statistics://predictions
```

## Troubleshooting

### Backend Services Not Responding

1. Check all three services are running
2. Verify ports 8090, 8081, 8082 are not in use
3. Check firewall settings

### Pattern Learning Not Working

1. Ensure SQLite database is writable
2. Check `mcp-server/data/` directory exists
3. Verify sufficient executions for learning (minimum 10)

### Predictions Too Conservative

The system starts conservative and improves over time:
- Initial predictions have low confidence
- After 100 executions: moderate confidence
- After 1000 executions: high confidence

## Advanced Configuration

### Adjust Learning Parameters

Edit `mcp-server/src/learners/pattern-learner.ts`:
```typescript
private learningBatchSize = 10; // Batch size for pattern learning
private minPatternOccurrences = 2; // Minimum occurrences to learn pattern
```

### Customize Agent Behavior

Edit `swarm/src/agent.rs` to modify pattern analysis logic for specific domains.

### Add Domain-Specific Modules

Create new modules in `mcp-server/src/domains/` for specialized pattern recognition:
- AWS operations
- Docker commands
- Kubernetes management
- Database queries

## Development

### Adding New Pattern Types

1. Define pattern type in `PatternType` enum
2. Implement learning logic in `PatternLearner`
3. Add prediction logic in `PatternPredictor`
4. Update agent behavior if needed

### Extending Predictions

The prediction system is modular:
```
Input → Ephemeral Agents → Neural Network → Prediction
```

Each component can be enhanced independently.

## Performance Tuning

- **Cache Duration**: 1 minute default, adjust in `PatternPredictor`
- **Agent Lifespan**: <100ms target, tune in `agent.rs`
- **Batch Learning**: Every 10 commands, adjust as needed
- **Database Indexes**: Already optimized for common queries

## Security Considerations

- Pattern database contains command history
- No credentials stored in patterns
- Sanitize error messages before storage
- Use read-only database access where possible