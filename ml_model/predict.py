import sys
import json
import cv2
import numpy as np
import pandas as pd
import os
from coffee_predictor import CoffeeBeanPredictor
from image_processor import BeanImageProcessor

def calculate_confidence(features_df):
    # Example of confidence calculation based on max feature values
    confidence = features_df.max().max()  # Max value from all features (replace with actual logic)
    return confidence

def get_quality_grade(total_score):
    # Determine the quality grade based on the total score
    if total_score >= 90:
        return 'Excellent'
    elif total_score >= 80:
        return 'Good'
    elif total_score >= 70:
        return 'Fair'
    elif total_score >= 60:
        return 'Poor'
    else:
        return 'Unacceptable'

def predict_qualities(image_path):
    try:
        print(f"Processing image: {image_path}", file=sys.stderr)
        if not os.path.exists(image_path):
            raise ValueError(f"Image file does not exist: {image_path}")
        
        # Load image
        print(f"Loading image...", file=sys.stderr)
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
        print("Calculating confidence...", file=sys.stderr)
        predictions['confidence'] = calculate_confidence(features_df)
        
        # Add quality grade
        total_score = sum(predictions[q] for q in ['Flavor', 'Aroma', 'Body', 'Acidity']) / 4
        predictions['quality_grade'] = get_quality_grade(total_score)
        
        # Return predictions as JSON
        print("Final predictions:", json.dumps(predictions), file=sys.stderr)
        print(json.dumps(predictions))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No image path provided'}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    predict_qualities(image_path)
