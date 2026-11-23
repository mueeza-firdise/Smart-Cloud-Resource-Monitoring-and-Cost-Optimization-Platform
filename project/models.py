"""
models.py
Data models and constants representing cloud telemetry, predictions,
auto-scaling decisions, and cost metrics.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ResourceMetric:
    timestamp: str
    cpu_usage: float
    ram_usage: float
    storage_usage: float
    server_count: int
    network_load: float
    users_count: int
    traffic_mode: str = "Normal"


@dataclass
class PredictionResult:
    timestamp: str
    actual_cpu: float
    predicted_cpu: float
    r2_score: float
    mae: float


@dataclass
class ScalingDecision:
    timestamp: str
    previous_servers: int
    new_servers: int
    delta: int
    predicted_cpu: float
    action: str
    reason: str


@dataclass
class CostSnapshot:
    timestamp: str
    active_servers: int
    hourly_cost: float
    daily_cost: float
    monthly_cost: float
    cost_without_optimization: float
    cost_with_optimization: float
    cost_saved_daily: float
    savings_percent: float
    recommendation: Optional[str] = None
