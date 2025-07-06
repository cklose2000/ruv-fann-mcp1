use ndarray::{Array1, Array2};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Simple feedforward neural network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralNetwork {
    pub layers: Vec<usize>,
    pub weights: Vec<Array2<f32>>,
    pub biases: Vec<Array1<f32>>,
    pub learning_rate: f32,
}

/// Global network storage (in-memory for POC)
lazy_static::lazy_static! {
    pub static ref NETWORK: Arc<Mutex<Option<NeuralNetwork>>> = Arc::new(Mutex::new(None));
}

impl NeuralNetwork {
    /// Create a new neural network with given layer sizes
    pub fn new(layers: Vec<usize>, learning_rate: f32) -> Self {
        let mut rng = rand::thread_rng();
        let mut weights = Vec::new();
        let mut biases = Vec::new();

        for i in 0..layers.len() - 1 {
            // Xavier initialization
            let scale = (2.0 / layers[i] as f32).sqrt();
            let w = Array2::from_shape_fn((layers[i + 1], layers[i]), |_| {
                rng.gen_range(-scale..scale)
            });
            let b = Array1::zeros(layers[i + 1]);
            
            weights.push(w);
            biases.push(b);
        }

        Self {
            layers,
            weights,
            biases,
            learning_rate,
        }
    }

    /// Sigmoid activation function
    fn sigmoid(x: f32) -> f32 {
        1.0 / (1.0 + (-x).exp())
    }

    /// Sigmoid derivative
    fn sigmoid_derivative(x: f32) -> f32 {
        let s = Self::sigmoid(x);
        s * (1.0 - s)
    }

    /// Forward propagation
    pub fn forward(&self, input: &Array1<f32>) -> Vec<Array1<f32>> {
        let mut activations = vec![input.clone()];
        let mut current = input.clone();

        for (_i, (weight, bias)) in self.weights.iter().zip(&self.biases).enumerate() {
            let z = weight.dot(&current) + bias;
            let activation = z.mapv(Self::sigmoid);
            
            activations.push(activation.clone());
            current = activation;
        }

        activations
    }

    /// Predict (forward pass returning only output)
    pub fn predict(&self, input: &Array1<f32>) -> Array1<f32> {
        let activations = self.forward(input);
        activations.last().unwrap().clone()
    }

    /// Train the network using backpropagation
    pub fn train(&mut self, inputs: &[Array1<f32>], targets: &[Array1<f32>], epochs: usize) -> Vec<f32> {
        let mut losses = Vec::new();

        for epoch in 0..epochs {
            let mut epoch_loss = 0.0;

            for (input, target) in inputs.iter().zip(targets) {
                // Forward pass
                let activations = self.forward(input);
                let output = activations.last().unwrap();

                // Calculate loss (MSE)
                let error = output - target;
                let loss = error.mapv(|x| x * x).sum() / error.len() as f32;
                epoch_loss += loss;

                // Backward pass
                let mut delta = error.clone();
                
                for i in (0..self.weights.len()).rev() {
                    let prev_activation = &activations[i];
                    
                    // Calculate gradients
                    let weight_gradient = delta
                        .clone()
                        .insert_axis(ndarray::Axis(1))
                        .dot(&prev_activation.clone().insert_axis(ndarray::Axis(0)));
                    
                    let bias_gradient = delta.clone();

                    // Update weights and biases
                    self.weights[i] = &self.weights[i] - &(weight_gradient * self.learning_rate);
                    self.biases[i] = &self.biases[i] - &(bias_gradient * self.learning_rate);

                    // Propagate error backward
                    if i > 0 {
                        let z = self.weights[i].t().dot(&delta);
                        delta = z.mapv(Self::sigmoid_derivative);
                    }
                }
            }

            epoch_loss /= inputs.len() as f32;
            losses.push(epoch_loss);

            if epoch % 100 == 0 {
                tracing::info!("Epoch {}: Loss = {:.6}", epoch, epoch_loss);
            }
        }

        losses
    }

    /// Get network info
    pub fn info(&self) -> NetworkInfo {
        NetworkInfo {
            layers: self.layers.clone(),
            total_parameters: self.weights.iter()
                .map(|w| w.len())
                .sum::<usize>() + 
                self.biases.iter()
                    .map(|b| b.len())
                    .sum::<usize>(),
            learning_rate: self.learning_rate,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub layers: Vec<usize>,
    pub total_parameters: usize,
    pub learning_rate: f32,
}