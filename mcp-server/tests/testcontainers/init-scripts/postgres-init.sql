-- PostgreSQL initialization script for test containers
-- Creates the same schema as SQLite but with PostgreSQL types

-- GCP Command Patterns table
CREATE TABLE IF NOT EXISTS gcp_command_patterns (
    id SERIAL PRIMARY KEY,
    tool VARCHAR(255) NOT NULL,
    params TEXT NOT NULL,
    context TEXT,
    outcome VARCHAR(50) NOT NULL CHECK (outcome IN ('success', 'failure')),
    duration INTEGER,
    error TEXT,
    cost_estimate DECIMAL(10, 6),
    rows_processed BIGINT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_gcp_command_tool ON gcp_command_patterns(tool);
CREATE INDEX idx_gcp_command_timestamp ON gcp_command_patterns(timestamp DESC);
CREATE INDEX idx_gcp_command_outcome ON gcp_command_patterns(outcome);

-- GCP Query Patterns table
CREATE TABLE IF NOT EXISTS gcp_query_patterns (
    id SERIAL PRIMARY KEY,
    query_type VARCHAR(50) NOT NULL,
    table_size_gb DECIMAL(10, 2),
    execution_time_ms INTEGER,
    cost_usd DECIMAL(10, 6),
    rows_returned BIGINT,
    success BOOLEAN NOT NULL,
    error_type VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query patterns
CREATE INDEX idx_gcp_query_type ON gcp_query_patterns(query_type);
CREATE INDEX idx_gcp_query_success ON gcp_query_patterns(success);

-- Authentication Patterns table
CREATE TABLE IF NOT EXISTS gcp_auth_patterns (
    id SERIAL PRIMARY KEY,
    token_age_minutes INTEGER NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for auth patterns
CREATE INDEX idx_gcp_auth_age ON gcp_auth_patterns(token_age_minutes);

-- User Behavior Patterns table
CREATE TABLE IF NOT EXISTS gcp_user_patterns (
    user_id VARCHAR(255) PRIMARY KEY,
    common_projects TEXT, -- JSON array stored as text
    frequent_datasets TEXT, -- JSON array stored as text
    typical_operations TEXT, -- JSON array stored as text
    error_patterns TEXT, -- JSON array stored as text
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some test data for integration tests
INSERT INTO gcp_command_patterns (tool, params, outcome, duration, cost_estimate)
VALUES 
    ('bq-query', '{"query": "SELECT 1"}', 'success', 150, 0.0),
    ('bq-query', '{"query": "SELECT * FROM large_table"}', 'failure', 5000, 5.0),
    ('bq-list-datasets', '{"projectId": "test-project"}', 'success', 200, 0.0);

INSERT INTO gcp_query_patterns (query_type, table_size_gb, execution_time_ms, cost_usd, rows_returned, success)
VALUES 
    ('SELECT', 1.5, 1500, 0.01, 1000, true),
    ('INSERT', 0.5, 500, 0.0, 100, true),
    ('DELETE', 2.0, 3000, 0.02, 500, false);

-- Grant permissions to test user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO testuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO testuser;