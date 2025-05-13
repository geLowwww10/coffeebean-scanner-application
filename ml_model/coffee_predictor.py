import lightgbm as lgb
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler

class CoffeeBeanPredictor:
    def __init__(self):
        self.models = None
        self.scaler = None
        self.feature_names = None
        
    def train(self, X, y):
        """
        Train models for each quality metric
        X: DataFrame with coffee bean features
        y: DataFrame with target variables (Flavor, Aroma, Body, Acidity)
        """
        self.feature_names = list(X.columns)
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        
        # Initialize models dictionary
        self.models = {}
        
        # Parameters for LightGBM
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
        
        # Train a model for each quality metric
        for quality in y.columns:
            train_data = lgb.Dataset(X_scaled, label=y[quality])
            self.models[quality] = lgb.train(
                params,
                train_data,
                num_boost_round=1000,
                early_stopping_rounds=50
            )
    
    def predict_qualities(self, features):
        """
        Predict coffee bean qualities
        features: Array of features extracted from image and other measurements
        """
        if self.models is None or self.scaler is None:
            raise ValueError("Model not trained or loaded. Call train() or load_model() first.")
        
        # Scale features
        features_scaled = self.scaler.transform(features)
        
        # Make predictions for each quality
        predictions = {}
        for quality, model in self.models.items():
            pred = model.predict(features_scaled)[0]
            # Ensure predictions are within valid range (0-10)
            pred = max(0, min(10, pred))
            predictions[quality] = float(pred)
        
        return predictions
    
    def save_model(self, filepath):
        """Save models, scaler, and feature names"""
        if self.models is None or self.scaler is None:
            raise ValueError("No trained model to save")
            
        model_data = {
            'models': self.models,
            'scaler': self.scaler,
            'feature_names': self.feature_names
        }
        joblib.dump(model_data, filepath)
    
    def load_model(self, filepath):
        """Load models, scaler, and feature names"""
        model_data = joblib.load(filepath)
        self.models = model_data['models']
        self.scaler = model_data['scaler']
        self.feature_names = model_data['feature_names']