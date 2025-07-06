# ruv-FANN MCP Server

An MCP (Model Context Protocol) server that leverages ruv-FANN neural intelligence to provide executive function capabilities for Claude Code. This server acts as a cognitive extension, enabling advanced planning, reasoning, and decision-making capabilities.

## 🧠 Executive Function Capabilities

### Core Features
- **Goal Planning**: Hierarchical goal decomposition and prioritization
- **Task Management**: Intelligent task ordering and dependency resolution  
- **Context Switching**: Efficient management of multiple concurrent contexts
- **Working Memory**: Neural-backed short-term memory for active tasks
- **Decision Making**: Evidence-based reasoning with confidence scoring
- **Pattern Recognition**: Learning from past decisions and outcomes

### Integration with ruv-FANN
- **Ephemeral Agents**: Spawn specialized cognitive agents for specific tasks
- **Neural Networks**: Pattern matching and decision optimization
- **Swarm Intelligence**: Coordinate multiple agents for complex reasoning
- **Time-Series Forecasting**: Predict task durations and resource needs

## 🚀 Quick Start

### Prerequisites
- Rust toolchain (1.70+)
- wasm-pack (for WASM demo)
- curl & jq (for demo script)

### Installation
```bash
# Clone and build
cd ruv-fann-poc
cargo build --release

# Install wasm-pack (if not already installed)
cargo install wasm-pack
```

### Running the POC

Start all three services in separate terminals:

```bash
# Terminal 1: Neural Network Core (Port 8090)
PORT=8090 ./target/release/ruv-fann-core

# Terminal 2: Swarm Coordinator (Port 8081)
./target/release/ruv-swarm --minimal --agents 2

# Terminal 3: Model Server (Port 8082)
./target/release/model-server
```

### Run the Demo
```bash
./examples/demo.sh
```

## 🧠 Components

### 1. MCP Server (NEW)
- Model Context Protocol server for Claude Code integration
- Tool request interception and prediction
- Pattern learning from execution history
- Real-time failure prevention (<50ms predictions)
- TypeScript/Node.js implementation

### 2. ruv-FANN Core
- Minimal feedforward neural network
- REST API for training and inference
- <1ms inference time
- Extended with pattern analysis agents

### 3. ruv-swarm (Ephemeral Intelligence)
- Specialized agents for pattern analysis:
  - Pattern Matcher: Identifies similar past commands
  - Outcome Predictor: Predicts success/failure probability
  - Alternative Generator: Suggests better approaches
  - Context Analyzer: Evaluates execution context
- <100ms total lifespan per agent
- SQLite for pattern persistence

### 4. Model Server
- Time series forecasting for command sequences
- Prediction of execution durations
- Confidence interval calculations

## 📊 Performance Metrics

- **Pattern Prediction**: <50ms end-to-end
- **Neural Network Inference**: <1ms per prediction
- **Ephemeral Agent Lifespan**: <100ms
- **Pattern Learning**: Batch processing every 10 commands
- **Success Rate**: >70% prediction accuracy after 1000 commands
- **Memory Usage**: <500MB total system
- **Cache Performance**: 1-minute prediction cache

## 🎮 MCP API Examples

### Predict Command Outcome
```bash
# Via MCP protocol
{
  "method": "call_tool",
  "params": {
    "name": "predict_outcome",
    "arguments": {
      "tool": "bq query",
      "params": {
        "query": "SELECT * FROM dataset.table",
        "use_legacy_sql": false
      }
    }
  }
}
```

### Learn from Execution
```bash
{
  "method": "call_tool",
  "params": {
    "name": "learn_pattern",
    "arguments": {
      "tool": "git push",
      "params": { "remote": "origin", "branch": "main" },
      "outcome": "failure",
      "duration": 2500,
      "error": "rejected: non-fast-forward"
    }
  }
}
```

### Get Alternative Suggestions
```bash
{
  "method": "call_tool",
  "params": {
    "name": "get_suggestions",
    "arguments": {
      "tool": "gcloud",
      "params": { "command": "compute instances list" },
      "goal": "List all running instances"
    }
  }
}
```

## 📁 Project Structure

```
ruv-fann-mcp1/
├── mcp-server/          # MCP server implementation
│   ├── src/
│   │   ├── clients/     # ruv-FANN service clients
│   │   ├── interceptors/# Tool request interceptors
│   │   ├── predictors/  # Pattern prediction engine
│   │   └── learners/    # Pattern learning system
│   └── data/            # Pattern database
├── core/                # Neural network foundation
├── swarm/               # Ephemeral agent system
│   └── src/agents/      # Specialized pattern agents
├── model/               # Time series forecasting
├── shared/              # Shared schemas
└── extensions/          # Pattern definitions
```

## 🚀 Next Steps

### Current Capabilities
- ✅ MCP server for Claude Code integration
- ✅ Pattern learning from command execution
- ✅ Real-time failure prediction (<50ms)
- ✅ Ephemeral agent analysis
- ✅ Alternative command suggestions

### Roadmap
1. **Enhanced Learning**
   - Deep learning for complex patterns
   - Cross-project knowledge transfer
   - User preference adaptation

2. **Domain Extensions**
   - Specialized modules for AWS, Azure
   - Docker/Kubernetes operations
   - Database query optimization

3. **Advanced Features**
   - Multi-step workflow prediction
   - Resource usage forecasting
   - Team pattern learning

4. **Integration**
   - Direct Claude Code plugin
   - VS Code extension
   - CLI tool for standalone use

## 📄 License

MIT OR Apache-2.0