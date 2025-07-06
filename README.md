# ruv-FANN Minimal POC

A minimal proof-of-concept implementation of the ruv-FANN neural intelligence platform, demonstrating core innovations in <500MB with <100ms decision times.

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

### 1. ruv-FANN Core
- Minimal feedforward neural network
- REST API for training and inference
- <1ms inference time
- ~1000 lines of Rust

### 2. ruv-swarm (Ephemeral Intelligence)
- Agents that spawn, solve, and dissolve
- <100ms total lifespan
- SQLite for state persistence
- ~500 lines of Rust

### 3. Model Server
- Simple MLP time series forecaster
- Pre-trained weights
- Confidence intervals
- ~300 lines of Rust

### 4. WASM Demo
- Neural networks in the browser
- XOR training demo
- Time series visualization
- ~200 lines JS/HTML

## 📊 Performance Metrics

- **Neural Network Training**: <1s for 1000 epochs
- **Inference Time**: <1ms per prediction
- **Ephemeral Agent Lifespan**: <100ms
- **Time Series Forecast**: <50ms
- **Total Memory**: <500MB
- **Binary Sizes**: ~5MB each

## 🎮 API Examples

### Create Neural Network
```bash
curl -X POST http://localhost:8090/api/network/create \
  -H "Content-Type: application/json" \
  -d '{"layers": [2, 4, 1], "learning_rate": 0.5}'
```

### Ephemeral Solve
```bash
curl -X POST http://localhost:8081/api/solve \
  -H "Content-Type: application/json" \
  -d '{"problem": "Analyze this data"}'
```

### Time Series Forecast
```bash
curl -X POST http://localhost:8082/api/forecast \
  -H "Content-Type: application/json" \
  -d '{"values": [1,2,3,4,5], "horizon": 3}'
```

## 🌐 WASM Demo

```bash
cd wasm
./build.sh
cd pkg
python3 -m http.server 8000
# Open http://localhost:8000
```

## 📁 Project Structure

```
ruv-fann-poc/
├── core/           # Neural network foundation
├── swarm/          # Ephemeral agent system
├── model/          # Forecasting model
├── wasm/           # Browser demo
└── examples/       # Integration demos
```

## 🚀 Next Steps

This POC demonstrates:
- ✅ Core neural network capabilities
- ✅ Ephemeral intelligence concept
- ✅ <100ms decision making
- ✅ WASM browser deployment
- ✅ Minimal resource footprint

To scale up:
1. Add GPU acceleration
2. Implement more neural architectures
3. Add distributed swarm coordination
4. Integrate full forecasting models
5. Deploy to cloud infrastructure

## 📄 License

MIT OR Apache-2.0