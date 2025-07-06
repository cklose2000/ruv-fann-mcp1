-- Comprehensive database setup for ruv-fann-mcp1 swarm

-- Create command_patterns table for pattern learning and prediction
CREATE TABLE IF NOT EXISTS command_patterns (
    id TEXT PRIMARY KEY,
    tool TEXT NOT NULL,
    params TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    outcome TEXT NOT NULL DEFAULT '',
    success BOOLEAN NOT NULL,
    duration REAL NOT NULL,
    error TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    agent_type TEXT NOT NULL DEFAULT 'unknown',
    agent_id TEXT NOT NULL DEFAULT '',
    params_hash TEXT,
    hour_of_day INTEGER,
    day_of_week INTEGER
);

-- Create agents table for agent lifecycle tracking
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    lifespan_ms INTEGER,
    problem TEXT,
    solution TEXT
);

-- High-performance indexes for sub-millisecond pattern queries
CREATE INDEX IF NOT EXISTS idx_command_patterns_tool ON command_patterns(tool);
CREATE INDEX IF NOT EXISTS idx_command_patterns_success ON command_patterns(success);
CREATE INDEX IF NOT EXISTS idx_command_patterns_timestamp ON command_patterns(timestamp);
CREATE INDEX IF NOT EXISTS idx_command_patterns_agent_type ON command_patterns(agent_type);
CREATE INDEX IF NOT EXISTS idx_command_patterns_tool_success ON command_patterns(tool, success);
CREATE INDEX IF NOT EXISTS idx_command_patterns_params_hash ON command_patterns(params_hash);
CREATE INDEX IF NOT EXISTS idx_command_patterns_hour_day ON command_patterns(hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_command_patterns_duration ON command_patterns(duration);

-- Indexes for agents table
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);
CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents(agent_type, status);

-- Performance optimization settings will be applied separately
-- (PRAGMA statements cannot be run inside migration transactions)