use crate::network::{NeuralNetwork, NetworkInfo, NETWORK};
use axum::{
    extract::Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use ndarray::Array1;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateNetworkRequest {
    pub layers: Vec<usize>,
    pub learning_rate: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrainRequest {
    pub inputs: Vec<Vec<f32>>,
    pub targets: Vec<Vec<f32>>,
    pub epochs: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PredictRequest {
    pub input: Vec<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PredictResponse {
    pub output: Vec<f32>,
    pub inference_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrainResponse {
    pub final_loss: f32,
    pub losses: Vec<f32>,
    pub training_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Json(self)).into_response()
    }
}

/// Create a new neural network
pub async fn create_network(
    Json(req): Json<CreateNetworkRequest>,
) -> Result<Json<NetworkInfo>, ApiError> {
    // Validate layers
    if req.layers.len() < 2 {
        return Err(ApiError {
            error: "Network must have at least 2 layers".to_string(),
        });
    }

    for &size in &req.layers {
        if size == 0 {
            return Err(ApiError {
                error: "Layer size must be greater than 0".to_string(),
            });
        }
    }

    let learning_rate = req.learning_rate.unwrap_or(0.1);
    let network = NeuralNetwork::new(req.layers, learning_rate);
    let info = network.info();

    // Store globally
    let mut global_network = NETWORK.lock().unwrap();
    *global_network = Some(network);

    tracing::info!("Created network: {:?}", info);
    Ok(Json(info))
}

/// Train the network
pub async fn train_network(
    Json(req): Json<TrainRequest>,
) -> Result<Json<TrainResponse>, ApiError> {
    let start = std::time::Instant::now();

    // Get the network
    let mut global_network = NETWORK.lock().unwrap();
    let network = global_network.as_mut().ok_or_else(|| ApiError {
        error: "No network created. Create a network first.".to_string(),
    })?;

    // Validate inputs
    if req.inputs.is_empty() || req.targets.is_empty() {
        return Err(ApiError {
            error: "Inputs and targets cannot be empty".to_string(),
        });
    }

    if req.inputs.len() != req.targets.len() {
        return Err(ApiError {
            error: "Number of inputs must match number of targets".to_string(),
        });
    }

    // Convert to ndarray format
    let inputs: Vec<Array1<f32>> = req
        .inputs
        .iter()
        .map(|v| Array1::from_vec(v.clone()))
        .collect();
    
    let targets: Vec<Array1<f32>> = req
        .targets
        .iter()
        .map(|v| Array1::from_vec(v.clone()))
        .collect();

    // Validate dimensions
    let input_size = network.layers[0];
    let output_size = network.layers.last().unwrap();

    for input in &inputs {
        if input.len() != input_size {
            return Err(ApiError {
                error: format!("Input size mismatch. Expected {}, got {}", input_size, input.len()),
            });
        }
    }

    for target in &targets {
        if target.len() != *output_size {
            return Err(ApiError {
                error: format!("Target size mismatch. Expected {}, got {}", output_size, target.len()),
            });
        }
    }

    // Train
    let epochs = req.epochs.unwrap_or(1000);
    let losses = network.train(&inputs, &targets, epochs);
    let final_loss = *losses.last().unwrap();

    let training_time_ms = start.elapsed().as_millis() as f64;
    tracing::info!("Training completed in {:.2}ms, final loss: {:.6}", training_time_ms, final_loss);

    Ok(Json(TrainResponse {
        final_loss,
        losses,
        training_time_ms,
    }))
}

/// Make predictions
pub async fn predict(
    Json(req): Json<PredictRequest>,
) -> Result<Json<PredictResponse>, ApiError> {
    let start = std::time::Instant::now();

    // Get the network
    let global_network = NETWORK.lock().unwrap();
    let network = global_network.as_ref().ok_or_else(|| ApiError {
        error: "No network created. Create a network first.".to_string(),
    })?;

    // Validate input size
    if req.input.len() != network.layers[0] {
        return Err(ApiError {
            error: format!(
                "Input size mismatch. Expected {}, got {}",
                network.layers[0],
                req.input.len()
            ),
        });
    }

    // Make prediction
    let input = Array1::from_vec(req.input);
    let output = network.predict(&input);

    let inference_time_ms = start.elapsed().as_micros() as f64 / 1000.0;
    tracing::debug!("Inference completed in {:.3}ms", inference_time_ms);

    Ok(Json(PredictResponse {
        output: output.to_vec(),
        inference_time_ms,
    }))
}

/// Get network info
pub async fn network_info() -> Result<Json<NetworkInfo>, ApiError> {
    let global_network = NETWORK.lock().unwrap();
    let network = global_network.as_ref().ok_or_else(|| ApiError {
        error: "No network created".to_string(),
    })?;

    Ok(Json(network.info()))
}