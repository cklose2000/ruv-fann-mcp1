-- Create command_patterns table for pattern learning
CREATE TABLE IF NOT EXISTS command_patterns (
    id TEXT PRIMARY KEY,
    tool TEXT NOT NULL,
    params TEXT NOT NULL,
    context TEXT NOT NULL,
    outcome TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    duration INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    error TEXT,  -- Adding error column for compatibility
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Create indexes for faster pattern matching queries
CREATE INDEX IF NOT EXISTS idx_command_patterns_tool ON command_patterns(tool);
CREATE INDEX IF NOT EXISTS idx_command_patterns_success ON command_patterns(success);
CREATE INDEX IF NOT EXISTS idx_command_patterns_timestamp ON command_patterns(timestamp);
CREATE INDEX IF NOT EXISTS idx_command_patterns_agent_type ON command_patterns(agent_type);
CREATE INDEX IF NOT EXISTS idx_command_patterns_tool_success ON command_patterns(tool, success);

-- Create agents table if it doesn't exist
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

-- Create indexes for agents table
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at);