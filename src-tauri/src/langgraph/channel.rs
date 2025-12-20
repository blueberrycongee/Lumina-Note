//! Channels for state management
//! 
//! Channels provide different strategies for aggregating state updates.
//! This is an advanced feature for complex state management scenarios.

use std::any::Any;

/// Channel trait for state field management
pub trait Channel: Send + Sync {
    /// Get the channel name
    fn name(&self) -> &str;
    
    /// Update the channel value
    fn update(&mut self, value: Box<dyn Any + Send + Sync>);
    
    /// Get the current value
    fn get(&self) -> Option<&dyn Any>;
    
    /// Reset the channel
    fn reset(&mut self);
}

/// Last value channel - keeps only the most recent value
pub struct LastValue<T> {
    name: String,
    value: Option<T>,
}

impl<T: Send + Sync + 'static> LastValue<T> {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: None,
        }
    }
    
    pub fn with_default(name: impl Into<String>, default: T) -> Self {
        Self {
            name: name.into(),
            value: Some(default),
        }
    }
}

impl<T: Send + Sync + 'static> Channel for LastValue<T> {
    fn name(&self) -> &str {
        &self.name
    }
    
    fn update(&mut self, value: Box<dyn Any + Send + Sync>) {
        if let Ok(v) = value.downcast::<T>() {
            self.value = Some(*v);
        }
    }
    
    fn get(&self) -> Option<&dyn Any> {
        self.value.as_ref().map(|v| v as &dyn Any)
    }
    
    fn reset(&mut self) {
        self.value = None;
    }
}

/// Append channel - accumulates values into a list
pub struct AppendChannel<T> {
    name: String,
    values: Vec<T>,
}

impl<T: Send + Sync + Clone + 'static> AppendChannel<T> {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            values: Vec::new(),
        }
    }
}

impl<T: Send + Sync + Clone + 'static> Channel for AppendChannel<T> {
    fn name(&self) -> &str {
        &self.name
    }
    
    fn update(&mut self, value: Box<dyn Any + Send + Sync>) {
        // Try to downcast to single value first
        let any_ref: &dyn Any = &*value;
        if let Some(v) = any_ref.downcast_ref::<T>() {
            self.values.push(v.clone());
        } else if let Some(vs) = any_ref.downcast_ref::<Vec<T>>() {
            self.values.extend(vs.iter().cloned());
        }
    }
    
    fn get(&self) -> Option<&dyn Any> {
        Some(&self.values as &dyn Any)
    }
    
    fn reset(&mut self) {
        self.values.clear();
    }
}

/// Binary operator channel - aggregates using a binary operator
pub struct BinaryOpChannel<T, F> {
    name: String,
    value: Option<T>,
    reducer: F,
}

impl<T, F> BinaryOpChannel<T, F>
where
    T: Send + Sync + Clone + 'static,
    F: Fn(T, T) -> T + Send + Sync,
{
    pub fn new(name: impl Into<String>, reducer: F) -> Self {
        Self {
            name: name.into(),
            value: None,
            reducer,
        }
    }
    
    pub fn with_default(name: impl Into<String>, default: T, reducer: F) -> Self {
        Self {
            name: name.into(),
            value: Some(default),
            reducer,
        }
    }
}

impl<T, F> Channel for BinaryOpChannel<T, F>
where
    T: Send + Sync + Clone + 'static,
    F: Fn(T, T) -> T + Send + Sync,
{
    fn name(&self) -> &str {
        &self.name
    }
    
    fn update(&mut self, value: Box<dyn Any + Send + Sync>) {
        if let Ok(v) = value.downcast::<T>() {
            self.value = Some(match self.value.take() {
                Some(existing) => (self.reducer)(existing, *v),
                None => *v,
            });
        }
    }
    
    fn get(&self) -> Option<&dyn Any> {
        self.value.as_ref().map(|v| v as &dyn Any)
    }
    
    fn reset(&mut self) {
        self.value = None;
    }
}

/// Common reducer functions
pub mod reducers {
    /// Add numbers
    pub fn add<T: std::ops::Add<Output = T>>(a: T, b: T) -> T {
        a + b
    }
    
    /// Multiply numbers
    pub fn multiply<T: std::ops::Mul<Output = T>>(a: T, b: T) -> T {
        a * b
    }
    
    /// Concatenate strings
    pub fn concat(a: String, b: String) -> String {
        format!("{}{}", a, b)
    }
    
    /// Take maximum
    pub fn max<T: Ord>(a: T, b: T) -> T {
        std::cmp::max(a, b)
    }
    
    /// Take minimum
    pub fn min<T: Ord>(a: T, b: T) -> T {
        std::cmp::min(a, b)
    }
    
    /// Merge vectors
    pub fn merge_vec<T: Clone>(mut a: Vec<T>, b: Vec<T>) -> Vec<T> {
        a.extend(b);
        a
    }
}
