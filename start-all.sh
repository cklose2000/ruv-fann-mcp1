#!/bin/bash

# Start all ruv-FANN POC services

echo "Starting ruv-FANN POC services..."

# Build if not already built
if [ ! -f "target/release/ruv-fann-core" ]; then
    echo "Building project..."
    cargo build --release
fi

# Kill any existing processes on our ports
for port in 8090 8081 8082; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

# Start services in background
echo "Starting ruv-FANN Core on port 8090..."
PORT=8090 ./target/release/ruv-fann-core > logs/core.log 2>&1 &
CORE_PID=$!

echo "Starting ruv-swarm on port 8081..."
./target/release/ruv-swarm --minimal --agents 2 > logs/swarm.log 2>&1 &
SWARM_PID=$!

echo "Starting Model Server on port 8082..."
./target/release/model-server > logs/model.log 2>&1 &
MODEL_PID=$!

# Create PID file
echo "CORE_PID=$CORE_PID" > .pids
echo "SWARM_PID=$SWARM_PID" >> .pids
echo "MODEL_PID=$MODEL_PID" >> .pids

# Wait for services to start
sleep 2

# Check if services are running
echo ""
echo "Checking services..."
for port in 8090 8081 8082; do
    if curl -s http://localhost:$port/health > /dev/null; then
        echo "✓ Service on port $port is running"
    else
        echo "✗ Service on port $port failed to start"
    fi
done

echo ""
echo "All services started! PIDs saved to .pids"
echo "To stop all services: ./stop-all.sh"
echo "To run demo: ./examples/demo.sh"
echo ""
echo "Logs are in the logs/ directory"