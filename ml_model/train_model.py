import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb
import joblib
import os

def load_and_prepare_data():
    """Load and combine both Arabica and Robusta datasets"""
    print("Loading datasets...")
    
    # Load datasets
    arabica_df = pd.read_csv('ml_model/dataset/arabica_data_cleaned.csv')
    robusta_df = pd.read_csv('ml_model/dataset/robusta_data_cleaned.csv')
    
    # Select relevant features for quality prediction
    quality_features = [
        'Aroma',
        'Flavor',
        'Aftertaste',
        'Acidity',
        'Body',
        'Balance',
        'Uniformity',
        'Clean.Cup',
        'Sweetness',
        'Moisture',
        'Category.One.Defects',
        'Quakers',
        'Category.Two.Defects'
    ]
    
    # Target variables we want to predict
    target_variables = ['Flavor', 'Aroma', 'Body', 'Acidity']
    
    # Combine datasets
    arabica_df['Species'] = 'Arabica'
    robusta_df['Species'] = 'Robusta'
    combined_df = pd.concat([arabica_df, robusta_df], ignore_index=True)
    
    # Create feature matrix X
    X = combined_df[quality_features].copy()
    
    # Create target matrix y
    y = combined_df[target_variables].copy()
    
    # Handle missing values
    X = X.fillna(X.mean())
    y = y.fillna(y.mean())
    
    return X, y

def train_model():
    """Train the LightGBM model using the coffee bean dataset"""
    print("Starting model training...")
    
    # Load and prepare data
    X, y = load_and_prepare_data()
    
    # Split data into training and testing sets
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, 
        test_size=0.2, 
        random_state=42
    )
    
    print(f"Training data shape: {X_train.shape}")
    print(f"Testing data shape: {X_test.shape}")
    
    # Initialize scaler
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # LightGBM parameters
    params = {
        'objective': 'regression',
        'metric': 'rmse',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.9,
        'bagging_fraction': 0.8,
        'bagging_freq': 5,
        'verbose': -1
    }
    
    # Train separate models for each quality metric
    models = {}
    predictions = {}
    
    for quality in y.columns:
        print(f"\nTraining model for {quality}...")
        
        # Create LightGBM datasets
        train_data = lgb.Dataset(X_train_scaled, label=y_train[quality])
        test_data = lgb.Dataset(X_test_scaled, label=y_test[quality], reference=train_data)
        
        # Train model with callbacks
        callbacks = [
            lgb.early_stopping(stopping_rounds=50),
            lgb.log_evaluation(period=-1)  # Disable per-iteration logging
        ]
        
        model = lgb.train(
            params,
            train_data,
            num_boost_round=1000,
            valid_sets=[test_data],
            callbacks=callbacks
        )
        
        # Store model
        models[quality] = model
        
        # Make predictions
        predictions[quality] = model.predict(X_test_scaled)
        
        # Calculate and print metrics
        mse = np.mean((predictions[quality] - y_test[quality]) ** 2)
        rmse = np.sqrt(mse)
        r2 = 1 - (np.sum((y_test[quality] - predictions[quality]) ** 2) / 
                  np.sum((y_test[quality] - y_test[quality].mean()) ** 2))
        
        print(f"{quality} - RMSE: {rmse:.4f}, R2: {r2:.4f}")
    
    # Save models and scaler
    print("\nSaving models and scaler...")
    model_data = {
        'models': models,
        'scaler': scaler,
        'feature_names': list(X.columns)
    }
    joblib.dump(model_data, 'ml_model/coffee_quality_model.joblib')
    
    return models, scaler, predictions, y_test

def test_model():
    """Test the saved model with sample data"""
    print("\nTesting saved model...")
    
    # Load model data
    model_data = joblib.load('ml_model/coffee_quality_model.joblib')
    models = model_data['models']
    scaler = model_data['scaler']
    
    # Load a few samples from the test set
    X, y = load_and_prepare_data()
    X_sample = X.sample(n=5, random_state=42)
    
    # Scale the sample data
    X_sample_scaled = scaler.transform(X_sample)
    
    # Make predictions
    print("\nSample predictions:")
    for i, (_, sample) in enumerate(X_sample.iterrows(), 1):
        predictions = {}
        for quality, model in models.items():
            pred = model.predict(X_sample_scaled[i-1:i])[0]
            predictions[quality] = round(pred, 2)
        
        print(f"\nSample {i} predictions:")
        for quality, value in predictions.items():
            print(f"{quality}: {value}")

if __name__ == "__main__":
    # Train the model
    print("=== Starting Coffee Bean Quality Model Training ===\n")
    models, scaler, predictions, y_test = train_model()
    
    # Test the saved model
    test_model()
    
    print("\n=== Training and Testing Completed ===")