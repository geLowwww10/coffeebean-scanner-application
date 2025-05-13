import sys
import json
import cv2
import numpy as np
import pandas as pd
from coffee_predictor import CoffeeBeanPredictor
from image_processor import BeanImageProcessor

def predict_qualities(image_path):
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Failed to load image")
        
        # Initialize processors
        image_processor = BeanImageProcessor()
        predictor = CoffeeBeanPredictor()
        
        # Load trained model
        predictor.load_model('ml_model/coffee_quality_model.joblib')
        
        # Process image and extract features
        features_df = image_processor.preprocess_image(image)
        
        # Get predictions
        predictions = predictor.predict_qualities(features_df)
        
        # Add confidence scores (based on feature quality)
        predictions['confidence'] = calculate_confidence(features_df)
        
        # Add quality grade
        total_score = sum(predictions[q] for q in ['Flavor', 'Aroma', 'Body', 'Acidity']) / 4
        predictions['quality_grade'] = get_quality_grade(total_score)
        
        # Return predictions as JSON
        print(json.dumps(predictions))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

def calculate_confidence(features_df):
    """Calculate confidence score for predictions"""
    # This is a simplified confidence calculation
    # You should adjust this based on your specific needs
    try:
        # Check if all required features are present
        expected_features = [
            'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance',
            'Uniformity', 'Clean.Cup', 'Sweetness', 'Moisture'
        ]
        
        # Calculate confidence based on feature completeness
        feature_presence = sum(1 for f in expected_features if f in features_df.columns)
        confidence = (feature_presence / len(expected_features)) * 100
        
        return min(100, max(0, confidence))  # Ensure confidence is between 0 and 100
        
    except Exception:
        return 70  # Default confidence if calculation fails

def get_quality_grade(score):
    """Convert numerical score to quality grade"""
    if score >= 9.0:
        return "Outstanding"
    elif score >= 8.0:
        return "Excellent"
    elif score >= 7.0:
        return "Very Good"
    elif score >= 6.0:
        return "Good"
    else:
        return "Fair"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Image path not provided'}))
        sys.exit(1)
        
    predict_qualities(sys.argv[1])