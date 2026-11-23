# AI-Powered Cloud Resource Monitoring & Auto-Scaling Simulator

## 1. Project Overview
An educational full-stack cloud infrastructure simulator designed for final-year CSE project demonstrations. It monitors simulated CPU, RAM, and Storage utilization, predicts future CPU demand using a Scikit-Learn Linear Regression model, dynamically scales virtual server capacity between 2 and 20 nodes, computes real-time cost optimization in INR, and exports PDF audit reports via ReportLab.

## 2. Features
- **Admin Session Authentication**: Secure login (`admin` / `admin123`) backed by hashed credentials in SQLite (`database/cloud.db`).
- **Predictive ML Engine**: Multivariate Linear Regression (`models/cpu_prediction.pkl`) trained on 1,080+ cloud telemetry intervals (`dataset/resource_usage.csv`).
- **Automated Horizontal Scaling**: Threshold rules (`>90% -> +3`, `>80% -> +2`, `<30% -> -1`, `<20% -> -2`, clamped `2–20`).
- **Cost Optimization Module**: Compares static peak provisioning against elastic auto-scaling (`₹10/server/hour`).
- **Interactive Dashboard**: 6 live KPI cards, 3 traffic load simulators (`Normal`, `Heavy`, `Peak`), AI recommendation panel, and 5 Chart.js visualizations.
- **PDF Report Export**: One-click ReportLab PDF report summarizing telemetry, predictions, scaling actions, and cost savings.

## 3. Technology Stack
- **Backend**: Python 3.11, Flask 3.0, SQLite3
- **Machine Learning**: Scikit-Learn (`LinearRegression`), Pandas, NumPy, Joblib
- **Reporting**: ReportLab
- **Frontend**: HTML5, CSS3, Bootstrap 5, JavaScript (ES6), Chart.js

## 4. Installation Steps
```bash
cd project
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 5. Dataset Information
- **File**: `dataset/resource_usage.csv`
- **Rows**: 1,080 hourly telemetry records
- **Features**: `Time`, `CPU Usage`, `RAM Usage`, `Server Count`, `Network Load`, `Users Count`
- **Generation**: `python generate_dataset.py`
- **Model Training**: `python train_model.py` (outputs `models/cpu_prediction.pkl`)

## 6. Architecture Diagram
```
+-----------------------+       HTTP / JSON       +------------------------+
|  Bootstrap 5 + Chart  | <---------------------> |   Flask App (app.py)   |
|  dashboard.html / js  |                         |       routes.py        |
+-----------------------+                         +-----------+------------+
                                                              |
          +-----------------------+---------------------------+-----------------------+
          |                       |                           |                       |
          v                       v                           v                       v
+-------------------+   +-------------------+      +--------------------+   +--------------------+
| prediction.py     |   | scaler.py         |      | database.py        |   | report_generator.py|
| LinearRegression  |   | Auto-Scale + Cost |      | SQLite cloud.db    |   | ReportLab PDF      |
| cpu_prediction.pkl|   | INR 10/hr Engine  |      | 5 Relational Tables|   | Executive Export   |
+-------------------+   +-------------------+      +--------------------+   +--------------------+
```

## 7. Running Instructions
```bash
python generate_dataset.py
python train_model.py
python app.py
```
Open `http://127.0.0.1:5000` and sign in with `admin` / `admin123`.

## 8. Expected Output
- Initial baseline at `45%` CPU and `3` active servers (`₹30/hr`).
- Triggering **Peak Traffic** raises CPU (`85–100%`), predicts future CPU via Linear Regression, automatically provisions additional servers, logs the event into SQLite, updates all 5 Chart.js graphs, and highlights daily/monthly INR cost savings.

## 9. Future Scope
- Integrate time-series LSTM / Prophet models for seasonal multi-day forecasting.
- Support live Prometheus / Kubernetes metrics ingestion via webhook collectors.
- Add multi-region cost comparison and spot-instance bidding simulation.
