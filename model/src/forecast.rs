use axum::{http::StatusCode, response::IntoResponse, Json};
use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize)]
pub struct ForecastRequest {
    pub values: Vec<f32>,
    pub horizon: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForecastResponse {
    pub forecast: Vec<f32>,
    pub confidence_lower: Vec<f32>,
    pub confidence_upper: Vec<f32>,
    pub model_type: String,
    pub inference_time_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub model_type: String,
    pub input_window: usize,
    pub max_horizon: usize,
    pub features: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::BAD_REQUEST, Json(self)).into_response()
    }
}

/// Simple MLP model for time series forecasting
pub struct SimpleMLP {
    pub weights: Vec<Array2<f32>>,
    pub biases: Vec<Array1<f32>>,
    pub input_window: usize,
}

impl SimpleMLP {
    /// Create a pre-trained model (with dummy weights for POC)
    pub fn new_pretrained() -> Self {
        let input_window = 10;
        let hidden_size = 20;
        let output_size = 1;

        // Initialize with "pre-trained" weights (actually just good initialization)
        let w1 = Array2::from_shape_fn((hidden_size, input_window), |(i, j)| {
            ((i + j) as f32 * 0.1).sin() * 0.5
        });
        let b1 = Array1::from_shape_fn(hidden_size, |i| i as f32 * 0.01);

        let w2 = Array2::from_shape_fn((output_size, hidden_size), |(i, j)| {
            ((i + j) as f32 * 0.2).cos() * 0.3
        });
        let b2 = Array1::zeros(output_size);

        Self {
            weights: vec![w1, w2],
            biases: vec![b1, b2],
            input_window,
        }
    }

    /// ReLU activation
    fn relu(x: f32) -> f32 {
        x.max(0.0)
    }

    /// Predict next value
    pub fn predict(&self, input: &Array1<f32>) -> f32 {
        // First layer
        let h1 = self.weights[0].dot(input) + &self.biases[0];
        let h1_activated = h1.mapv(Self::relu);

        // Output layer
        let output = self.weights[1].dot(&h1_activated) + &self.biases[1];
        output[0]
    }

    /// Forecast multiple steps ahead
    pub fn forecast(&self, historical: &[f32], horizon: usize) -> Vec<f32> {
        let mut forecast = Vec::new();
        let mut window: Vec<f32> = historical
            .iter()
            .rev()
            .take(self.input_window)
            .rev()
            .cloned()
            .collect();

        for _ in 0..horizon {
            // Normalize input (simple min-max scaling)
            let min = window.iter().fold(f32::INFINITY, |a, &b| a.min(b));
            let max = window.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));
            let range = max - min;
            
            let normalized: Vec<f32> = window
                .iter()
                .map(|&x| if range > 0.0 { (x - min) / range } else { 0.5 })
                .collect();
            
            let input = Array1::from_vec(normalized);
            let pred_normalized = self.predict(&input);
            
            // Denormalize
            let pred = pred_normalized * range + min;
            
            // Add trend component
            let trend = if window.len() >= 2 {
                window[window.len() - 1] - window[window.len() - 2]
            } else {
                0.0
            };
            
            let pred_with_trend = pred + trend * 0.3; // Partial trend following
            
            forecast.push(pred_with_trend);
            
            // Slide window
            window.remove(0);
            window.push(pred_with_trend);
        }

        forecast
    }
}

// Global model instance
lazy_static::lazy_static! {
    static ref MODEL: Arc<Mutex<SimpleMLP>> = Arc::new(Mutex::new(SimpleMLP::new_pretrained()));
}

/// Initialize the model
pub fn initialize_model() {
    let _model = MODEL.lock().unwrap();
    tracing::info!("Model initialized successfully");
}

/// Perform forecasting
pub async fn forecast(Json(req): Json<ForecastRequest>) -> Result<Json<ForecastResponse>, ApiError> {
    let start = std::time::Instant::now();

    // Validate input
    if req.values.is_empty() {
        return Err(ApiError {
            error: "Input values cannot be empty".to_string(),
        });
    }

    if req.values.len() < 10 {
        return Err(ApiError {
            error: "Need at least 10 historical values for forecasting".to_string(),
        });
    }

    let horizon = req.horizon.unwrap_or(5).min(30); // Max 30 steps ahead

    // Get forecast
    let model = MODEL.lock().unwrap();
    let forecast = model.forecast(&req.values, horizon);
    
    // Generate confidence intervals (simple approach)
    let std_dev = calculate_std_dev(&req.values);
    let confidence_factor = 1.96; // 95% confidence
    
    let confidence_lower: Vec<f32> = forecast
        .iter()
        .enumerate()
        .map(|(i, &val)| val - confidence_factor * std_dev * (1.0 + i as f32 * 0.1))
        .collect();
    
    let confidence_upper: Vec<f32> = forecast
        .iter()
        .enumerate()
        .map(|(i, &val)| val + confidence_factor * std_dev * (1.0 + i as f32 * 0.1))
        .collect();

    let inference_time_ms = start.elapsed().as_micros() as f64 / 1000.0;

    Ok(Json(ForecastResponse {
        forecast,
        confidence_lower,
        confidence_upper,
        model_type: "MLP".to_string(),
        inference_time_ms,
    }))
}

/// Get model information
pub async fn model_info() -> Json<ModelInfo> {
    Json(ModelInfo {
        name: "SimpleMLP Forecaster".to_string(),
        model_type: "Multi-Layer Perceptron".to_string(),
        input_window: 10,
        max_horizon: 30,
        features: vec![
            "Time series forecasting".to_string(),
            "Confidence intervals".to_string(),
            "Trend following".to_string(),
            "Fast inference (<50ms)".to_string(),
        ],
    })
}

/// Calculate standard deviation
fn calculate_std_dev(values: &[f32]) -> f32 {
    let mean = values.iter().sum::<f32>() / values.len() as f32;
    let variance = values
        .iter()
        .map(|&x| (x - mean).powi(2))
        .sum::<f32>() / values.len() as f32;
    variance.sqrt()
}