// Quick Rust program to initialize the database
use sqlx::sqlite::SqlitePool;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create database connection
    let pool = SqlitePool::connect("sqlite:ruv_swarm.db").await?;
    
    // Create agents table
    sqlx::query!(
        r#"
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
        )
        "#
    )
    .execute(&pool)
    .await?;
    
    // Create command_patterns table
    sqlx::query!(
        r#"
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
            error TEXT,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
        "#
    )
    .execute(&pool)
    .await?;
    
    // Create indexes
    let indexes = vec![
        "CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)",
        "CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_command_patterns_tool ON command_patterns(tool)",
        "CREATE INDEX IF NOT EXISTS idx_command_patterns_success ON command_patterns(success)",
        "CREATE INDEX IF NOT EXISTS idx_command_patterns_timestamp ON command_patterns(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_command_patterns_agent_type ON command_patterns(agent_type)",
        "CREATE INDEX IF NOT EXISTS idx_command_patterns_tool_success ON command_patterns(tool, success)",
    ];
    
    for index_sql in indexes {
        sqlx::query(index_sql).execute(&pool).await?;
    }
    
    println!("✅ Database initialized successfully!");
    println!("Tables created:");
    println!("  - agents");
    println!("  - command_patterns");
    
    Ok(())
}