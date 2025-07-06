#!/bin/bash

# Build WASM module
echo "Building WASM module..."
wasm-pack build --target web --out-dir pkg

# Copy demo files to pkg directory for easy serving
cp index.html pkg/

echo "Build complete! To run the demo:"
echo "  cd pkg"
echo "  python3 -m http.server 8000"
echo "  Open http://localhost:8000 in your browser"