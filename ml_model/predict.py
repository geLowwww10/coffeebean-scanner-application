import sys
import json
import cv2
import numpy as np
import pandas as pd
import os
from coffee_predictor import CoffeeBeanPredictor
from image_processor import BeanImageProcessor

def predict_qualities(image_path):
    try:
        print(f"Processing image: {image_path}", file=sys.stderr)
        if not os.path.exists(image_path):
            raise ValueError(f"Image file does not exist: {image_path}")
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Failed to load image: {image_path}")
        
        print(f"Image loaded successfully. Shape: {image.shape}", file=sys.stderr)
        
        # Initialize processors
        image_processor = BeanImageProcessor()
        predictor = CoffeeBeanPredictor()
        
        # Load trained model
        model_path = os.path.join(os.path.dirname(__file__), 'coffee_quality_model.joblib')
        print(f"Loading model from: {model_path}", file=sys.stderr)
        predictor.load_model(model_path)
        
        # Process image and extract features
        print("Processing image features...", file=sys.stderr)
        features_df = image_processor.preprocess_image(image)
        
        # Get predictions
        print("Making predictions...", file=sys.stderr)
        predictions = predictor.predict_qualities(features_df)
        
        # Add confidence scores (based on feature quality)
        predictions['confidence'] = calculate_confidence(features_df)
        
        # Add quality grade
        total_score = sum(predictions[q] for q in ['Flavor', 'Aroma', 'Body', 'Acidity']) / 4
        predictions['quality_grade'] = get_quality_grade(total_score)
        
        # Return predictions as JSON
        print(json.dumps(predictions))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

def calculate_confidence(features_df):
    """Calculate confidence score for predictions"""
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
        
    except Exception as e:
        print(f"Warning: Failed to calculate confidence: {str(e)}", file=sys.stderr)
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