#!/bin/bash
# Initialize the SQLite database for ruv-swarm

echo "Initializing ruv_swarm.db..."

# Create the database and tables
sqlite3 ruv_swarm.db < create_database.sql

if [ $? -eq 0 ]; then
    echo "✅ Database initialized successfully!"
    echo ""
    echo "Tables created:"
    echo "  - agents"
    echo "  - command_patterns"
    echo ""
    echo "You can now run: cargo build --release"
else
    echo "❌ Database initialization failed!"
fi