"""
services/prediction.py
Scikit-Learn Linear Regression pipeline:
1. Load Dataset (dataset/resource_usage.csv)
2. Clean Data (drop NaNs, clip bounds, engineer next-step target)
3. Train LinearRegression model
4. Save Model (models/cpu_prediction.pkl)
5. Predict Future CPU Usage
"""

import os
from typing import Dict, Any, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_PATH = os.path.join(BASE_DIR, "dataset", "resource_usage.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "cpu_prediction.pkl")

FEATURE_COLUMNS = [
    "CPU Usage",
    "RAM Usage",
    "Server Count",
    "Network Load",
    "Users Count",
]


def train_and_save_model(
    dataset_path: str = DATASET_PATH,
    model_path: str = MODEL_PATH,
) -> Dict[str, Any]:
    """Load CSV, clean records, train Linear Regression, evaluate, and save .pkl."""
    if not os.path.exists(dataset_path):
        from generate_dataset import generate_synthetic_dataset
        generate_synthetic_dataset(dataset_path)

    df = pd.read_csv(dataset_path)

    # Data cleaning
    df = df.dropna().drop_duplicates()
    for col in FEATURE_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna()
    df["CPU Usage"] = df["CPU Usage"].clip(0.0, 100.0)
    df["RAM Usage"] = df["RAM Usage"].clip(0.0, 100.0)

    # Target: Future CPU Usage (next interval t+1)
    df["Future CPU"] = df["CPU Usage"].shift(-1)
    df = df.dropna()

    X = df[FEATURE_COLUMNS].values
    y = df["Future CPU"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = float(round(r2_score(y_test, y_pred), 4))
    mae = float(round(mean_absolute_error(y_test, y_pred), 2))

    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    bundle = {
        "model": model,
        "features": FEATURE_COLUMNS,
        "r2_score": r2,
        "mae": mae,
        "rows_trained": len(df),
    }
    joblib.dump(bundle, model_path)

    return {
        "r2_score": r2,
        "mae": mae,
        "rows_trained": len(df),
        "coefficients": dict(zip(FEATURE_COLUMNS, [round(float(c), 5) for c in model.coef_])),
        "intercept": round(float(model.intercept_), 4),
    }


def load_model_bundle(model_path: str = MODEL_PATH) -> Dict[str, Any]:
    if not os.path.exists(model_path):
        train_and_save_model(model_path=model_path)
    return joblib.load(model_path)


def predict_future_cpu(
    cpu_usage: float,
    ram_usage: float,
    server_count: int,
    network_load: float,
    users_count: int,
) -> Tuple[float, float, float]:
    """Return (predicted_cpu, r2_score, mae) using the saved Scikit-Learn LinearRegression."""
    bundle = load_model_bundle()
    model: LinearRegression = bundle["model"]

    features = np.array([[cpu_usage, ram_usage, server_count, network_load, users_count]])
    raw_pred = float(model.predict(features)[0])
    predicted_cpu = round(max(5.0, min(100.0, raw_pred)), 2)

    return predicted_cpu, float(bundle["r2_score"]), float(bundle["mae"])
