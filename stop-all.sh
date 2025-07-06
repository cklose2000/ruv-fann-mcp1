#!/bin/bash

# Stop all ruv-FANN POC services

echo "Stopping ruv-FANN POC services..."

# Read PIDs from file
if [ -f ".pids" ]; then
    source .pids
    
    # Kill processes
    for pid in $CORE_PID $SWARM_PID $MODEL_PID; do
        if kill -0 $pid 2>/dev/null; then
            kill $pid
            echo "Stopped process $pid"
        fi
    done
    
    rm .pids
else
    # Fallback: kill by port
    echo "No PID file found, killing by port..."
    for port in 8090 8081 8082; do
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
    done
fi

echo "All services stopped."