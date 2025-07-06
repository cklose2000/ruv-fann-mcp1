use wasm_bindgen::prelude::*;
use ndarray::{Array1, Array2};
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
pub struct WasmNeuralNetwork {
    weights: Vec<Array2<f32>>,
    biases: Vec<Array1<f32>>,
}

#[wasm_bindgen]
impl WasmNeuralNetwork {
    #[wasm_bindgen(constructor)]
    pub fn new(layers: &[usize]) -> Self {
        let mut weights = Vec::new();
        let mut biases = Vec::new();

        for i in 0..layers.len() - 1 {
            let scale = (2.0 / layers[i] as f32).sqrt();
            let w = Array2::from_shape_fn((layers[i + 1], layers[i]), |(i, j)| {
                ((i * j + 1) as f32 * 0.7853981633974483).sin() * scale
            });
            let b = Array1::zeros(layers[i + 1]);
            
            weights.push(w);
            biases.push(b);
        }

        Self { weights, biases }
    }

    pub fn predict(&self, input: &[f32]) -> Vec<f32> {
        let mut current = Array1::from_vec(input.to_vec());

        for (i, (weight, bias)) in self.weights.iter().zip(&self.biases).enumerate() {
            let z = weight.dot(&current) + bias;
            // Apply activation (sigmoid for last layer, ReLU for others)
            current = if i == self.weights.len() - 1 {
                z.mapv(|x| 1.0 / (1.0 + (-x).exp()))
            } else {
                z.mapv(|x| x.max(0.0))
            };
        }

        current.to_vec()
    }

    pub fn train_step(&mut self, input: &[f32], target: &[f32], learning_rate: f32) -> f32 {
        // Simple forward pass
        let mut activations = vec![Array1::from_vec(input.to_vec())];
        let mut current = Array1::from_vec(input.to_vec());

        for (i, (weight, bias)) in self.weights.iter().zip(&self.biases).enumerate() {
            let z = weight.dot(&current) + bias;
            current = if i == self.weights.len() - 1 {
                z.mapv(|x| 1.0 / (1.0 + (-x).exp()))
            } else {
                z.mapv(|x| x.max(0.0))
            };
            activations.push(current.clone());
        }

        // Calculate loss
        let output = activations.last().unwrap();
        let target_array = Array1::from_vec(target.to_vec());
        let error = output - &target_array;
        let loss = error.mapv(|x| x * x).sum() / error.len() as f32;

        // Simple gradient descent (simplified backprop)
        let mut delta = error.clone();
        
        for i in (0..self.weights.len()).rev() {
            let prev_activation = &activations[i];
            
            // Update weights and biases
            let weight_gradient = delta
                .clone()
                .insert_axis(ndarray::Axis(1))
                .dot(&prev_activation.clone().insert_axis(ndarray::Axis(0)));
            
            self.weights[i] = &self.weights[i] - &(weight_gradient * learning_rate);
            self.biases[i] = &self.biases[i] - &(delta.clone() * learning_rate);

            // Propagate error (simplified)
            if i > 0 {
                delta = self.weights[i].t().dot(&delta);
                // Apply derivative of ReLU
                delta = delta * &activations[i].mapv(|x| if x > 0.0 { 1.0 } else { 0.0 });
            }
        }

        loss
    }
}

#[derive(Serialize, Deserialize)]
pub struct PredictionResult {
    pub output: Vec<f32>,
    pub confidence: f32,
}

#[wasm_bindgen]
pub fn create_xor_demo() -> WasmNeuralNetwork {
    WasmNeuralNetwork::new(&[2, 4, 1])
}

#[wasm_bindgen]
pub fn process_time_series(data: &[f32], window_size: usize) -> Vec<f32> {
    if data.len() < window_size {
        return vec![];
    }

    let mut predictions = Vec::new();
    for i in 0..data.len() - window_size {
        let window = &data[i..i + window_size];
        let avg = window.iter().sum::<f32>() / window_size as f32;
        let trend = if window_size > 1 {
            (window[window_size - 1] - window[0]) / (window_size - 1) as f32
        } else {
            0.0
        };
        predictions.push(avg + trend);
    }
    predictions
}