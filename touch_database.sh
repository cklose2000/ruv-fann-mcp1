#!/bin/bash
# Create empty SQLite database file

echo "Creating empty ruv_swarm.db..."
touch ruv_swarm.db

if [ -f ruv_swarm.db ]; then
    echo "✅ Database file created!"
    echo ""
    echo "The tables will be created automatically when you run the swarm service."
    echo ""
    echo "You can now run: cargo build --release"
    echo ""
    echo "Note: The main.rs already has code to create tables on startup."
else
    echo "❌ Failed to create database file!"
fi