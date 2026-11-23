"""
train_model.py
Standalone training script to build and save models/cpu_prediction.pkl
from dataset/resource_usage.csv using Scikit-Learn LinearRegression.
"""

from services.prediction import train_and_save_model


if __name__ == "__main__":
    metrics = train_and_save_model()
    print("Linear Regression Model Trained Successfully")
    print(f"Rows Trained : {metrics['rows_trained']}")
    print(f"R2 Score     : {metrics['r2_score']}")
    print(f"MAE (%)      : {metrics['mae']}")
    print(f"Intercept    : {metrics['intercept']}")
    print(f"Coefficients : {metrics['coefficients']}")
