# ruv-FANN Enhanced MCP Server

An intelligent Model Context Protocol (MCP) server that enhances GCP operations with AI-powered predictions, pattern learning, and cost estimation.

## Overview

This MCP server acts as an intelligent proxy between Claude and GCP services, providing:

- **AI-Powered Predictions**: Uses ruv-FANN neural networks to predict operation success/failure
- **Pattern Learning**: Learns from past operations to improve future predictions
- **Cost Estimation**: Estimates costs for BigQuery operations before execution
- **Auth Token Monitoring**: Tracks token age and predicts auth-related failures
- **Intelligent Warnings**: Provides contextual warnings and suggestions
- **Ephemeral Agent Analysis**: Spawns specialized agents for deep pattern analysis

## Architecture

```
Claude → ruv-FANN Enhanced MCP → [Intelligence Layer] → gcp-fresh-mcp → Google Cloud
                                         ↓
                                   ruv-FANN Services
                                   Pattern Database
```

## Features

### 1. Intelligent GCP Operations
- All GCP tools are enhanced with predictive intelligence
- Operations can be blocked if failure probability is too high
- Real-time cost estimation for BigQuery queries

### 2. Pattern Learning
- Records all operations and their outcomes
- Learns from failures to prevent future errors
- Identifies common error patterns per user/project

### 3. Swarm Intelligence
- Spawns ephemeral agents for pattern analysis:
  - Pattern Matcher: Finds similar historical operations
  - Outcome Predictor: Predicts success probability
  - Alternative Generator: Suggests better approaches
  - Context Analyzer: Evaluates operation context

### 4. Available Tools

#### Intelligence Tools
- `predict_outcome`: Predict command success before execution
- `learn_pattern`: Manually teach the system new patterns
- `get_suggestions`: Get AI-powered suggestions for commands

#### GCP Tools (Enhanced)
All standard GCP tools from gcp-fresh-mcp, enhanced with intelligence:
- `gcp-sql`: Universal SQL interface for BigQuery
- `bq-query`: Execute BigQuery queries with cost prediction
- `bq-list-datasets`: List datasets with usage patterns
- `bq-list-tables`: List tables with access frequency
- `bq-create-dataset`: Create datasets with best practices
- And more...

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ruv-fann-mcp1/mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the server:
```bash
npm run build
```

5. Configure Claude Desktop:
Add to your Claude Desktop configuration:
```json
{
  "mcpServers": {
    "ruv-fann-enhanced": {
      "command": "node",
      "args": ["/path/to/ruv-fann-mcp1/mcp-server/dist/index.js"],
      "env": {
        "RUV_FANN_CORE_URL": "http://127.0.0.1:8090",
        "RUV_FANN_SWARM_URL": "http://127.0.0.1:8081",
        "RUV_FANN_MODEL_URL": "http://127.0.0.1:8082",
        "GCP_MCP_BACKEND_URL": "http://127.0.0.1:8080",
        "GCP_MCP_SECRET": "your-secret-token"
      }
    }
  }
}
```

## Usage Examples

### Basic GCP Operation with Intelligence
```
User: List my BigQuery datasets
Assistant: I'll list your BigQuery datasets with intelligence insights...

🤖 Intelligence Analysis:
- Success Probability: 95%
- Estimated Duration: 1.2s
- No warnings detected

[Lists datasets...]
```

### Cost Estimation
```
User: Run a query on my large dataset
Assistant: 🤖 Intelligence Warning:
💰 Estimated Cost: $45.67
⚠️ Large table scan detected (1.2TB)
💡 Suggestion: Add WHERE clause to reduce scan size

Proceed with operation? [Shows query plan...]
```

### Learning from Failures
```
User: Create dataset in wrong location
Assistant: ❌ Operation Failed
Error: Invalid location 'mars-central1'

🤖 Intelligence: This failure was predicted (15% success probability)
💡 Suggested fix: Use 'US' or 'EU' as location

*This failure has been recorded for future intelligence improvements.*
```

## Configuration

### Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `RUV_FANN_*_URL`: URLs for ruv-FANN backend services
- `GCP_MCP_BACKEND_URL`: URL for gcp-fresh-mcp server
- `PREDICTION_WARNING_THRESHOLD`: Show warnings below this probability
- `PREDICTION_BLOCK_THRESHOLD`: Block operations below this probability

### Database

The server automatically creates SQLite databases in the `data/` directory:
- `patterns.db`: General operation patterns
- `gcp_patterns.db`: GCP-specific patterns and analytics

## Development

### Running in Development
```bash
npm run dev
```

### Running Tests
```bash
npm test
```

### Building
```bash
npm run build
```

## Monitoring

The server logs detailed information about:
- Prediction accuracy
- Pattern learning progress
- Cost estimation accuracy
- Error patterns
- Agent analysis results

## Security

- All sensitive parameters are sanitized in logs
- Auth tokens are never stored
- Pattern data is anonymized
- Supports secret rotation via environment variables

## Troubleshooting

### Common Issues

1. **Connection Failed**: Ensure all backend services are running
2. **No Predictions**: Check if pattern database has enough data
3. **High Failure Rate**: Review pattern learning configuration

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

[License information]