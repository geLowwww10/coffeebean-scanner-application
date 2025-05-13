import cv2
import numpy as np
import pandas as pd

class BeanImageProcessor:
    def __init__(self):
        self.target_size = (224, 224)
        self.feature_names = [
            'Aroma', 'Flavor', 'Aftertaste', 'Acidity', 'Body', 'Balance',
            'Uniformity', 'Clean.Cup', 'Sweetness', 'Moisture',
            'Category.One.Defects', 'Quakers', 'Category.Two.Defects'
        ]
    
    def preprocess_image(self, image):
        """
        Extract features from image and create a feature vector matching the training data
        """
        # Resize image
        image = cv2.resize(image, self.target_size)
        
        # Convert to different color spaces
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        
        # Extract image features
        features = self._extract_image_features(image, hsv, lab)
        
        # Create a feature dictionary matching the training data structure
        feature_dict = self._create_feature_dict(features)
        
        # Convert to DataFrame to ensure correct feature order
        feature_df = pd.DataFrame([feature_dict])
        
        return feature_df
    
    def _extract_image_features(self, bgr, hsv, lab):
        """Extract comprehensive features from the image"""
        features = {}
        
        # Color features
        features['color_mean_bgr'] = np.mean(bgr, axis=(0,1))
        features['color_std_bgr'] = np.std(bgr, axis=(0,1))
        features['color_mean_hsv'] = np.mean(hsv, axis=(0,1))
        features['color_mean_lab'] = np.mean(lab, axis=(0,1))
        
        # Texture features
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        features['texture_variance'] = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        # Bean shape features
        edges = cv2.Canny(gray, 100, 200)
        features['edge_density'] = np.mean(edges)
        
        return features
    
    def _create_feature_dict(self, image_features):
        """
        Create a feature dictionary matching the training data structure
        This is a simplified version - in practice, you'd need more sophisticated
        feature extraction and mapping
        """
        # Initialize with default values
        feature_dict = {
            'Aroma': 7.5,  # Default values based on dataset averages
            'Flavor': 7.5,
            'Aftertaste': 7.5,
            'Acidity': 7.5,
            'Body': 7.5,
            'Balance': 7.5,
            'Uniformity': 10.0,
            'Clean.Cup': 10.0,
            'Sweetness': 10.0,
            'Moisture': 0.12,
            'Category.One.Defects': 0,
            'Quakers': 0,
            'Category.Two.Defects': 0
        }
        
        # Update features based on image analysis
        # This is where you'd implement your specific feature extraction logic
        # Example mapping (you'd need to adjust these based on your specific needs):
        color_bgr = image_features['color_mean_bgr']
        color_hsv = image_features['color_mean_hsv']
        color_lab = image_features['color_mean_lab']
        
        # Example mappings (these should be calibrated based on actual data):
        feature_dict['Moisture'] = (color_hsv[1] / 255.0) * 0.15  # Map saturation to moisture
        feature_dict['Category.One.Defects'] = int(image_features['edge_density'] / 50)  # Map edge density to defects
        feature_dict['Body'] = (color_lab[0] / 255.0) * 10  # Map lightness to body
        
        return feature_dict