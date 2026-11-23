"""
services/scaler.py
Auto-scaling decision engine, cost optimization calculator, and AI recommendation panel.
"""

from datetime import datetime
from typing import Dict, Any, List

MIN_SERVERS = 2
MAX_SERVERS = 20
COST_PER_SERVER_HOUR = 10.0  # INR 10 per hour
STATIC_PEAK_SERVERS = 9      # Unoptimized static provisioning sized for peak bursts


def evaluate_auto_scaling(
    current_servers: int,
    predicted_cpu: float,
    actual_cpu: float,
) -> Dict[str, Any]:
    """
    Apply threshold-based auto-scaling rules:
    - predicted_cpu > 90% -> ADD 3 SERVERS
    - predicted_cpu > 80% -> ADD 2 SERVERS
    - predicted_cpu < 20% -> REMOVE 2 SERVERS
    - predicted_cpu < 30% -> REMOVE 1 SERVER
    Clamped between MIN_SERVERS (2) and MAX_SERVERS (20).
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    delta = 0
    action = "HOLD"
    recommendations: List[str] = []

    if predicted_cpu > 90.0:
        delta = 3
        action = "SCALE_UP"
        recommendations.append("Predicted CPU exceeds critical 90% threshold.")
    elif predicted_cpu > 80.0:
        delta = 2
        action = "SCALE_UP"
        recommendations.append("Predicted CPU exceeds 80% threshold.")
    elif predicted_cpu < 20.0:
        delta = -2
        action = "SCALE_DOWN"
        recommendations.append("Predicted CPU is below 20% low-load threshold.")
    elif predicted_cpu < 30.0:
        delta = -1
        action = "SCALE_DOWN"
        recommendations.append("Predicted CPU is below 30% utilization threshold.")
    else:
        recommendations.append("Resource utilization is healthy.")

    new_servers = max(MIN_SERVERS, min(MAX_SERVERS, current_servers + delta))
    actual_delta = new_servers - current_servers

    if actual_delta > 0:
        reason = f"Scaling up {actual_delta} server(s) to absorb projected {predicted_cpu:.1f}% CPU load."
        recommendations.append(f"Scaling up {actual_delta} servers.")
    elif actual_delta < 0:
        reason = f"Scaling down {abs(actual_delta)} server(s) to eliminate idle capacity."
        recommendations.append(f"Scaling down {abs(actual_delta)} servers.")
    else:
        if current_servers == MAX_SERVERS and delta > 0:
            reason = "Cluster at maximum capacity (20 servers); horizontal limit reached."
        elif current_servers == MIN_SERVERS and delta < 0:
            reason = "Cluster at minimum high-availability floor (2 servers)."
        else:
            reason = f"Current capacity ({current_servers} servers) matches projected {predicted_cpu:.1f}% CPU load."

    if actual_cpu <= 80.0 and new_servers <= STATIC_PEAK_SERVERS:
        recommendations.append("Cost optimization successful.")

    return {
        "timestamp": timestamp,
        "previous_servers": current_servers,
        "new_servers": new_servers,
        "delta": actual_delta,
        "predicted_cpu": predicted_cpu,
        "action": action,
        "reason": reason,
        "recommendations": recommendations,
    }


def calculate_cost_metrics(active_servers: int) -> Dict[str, Any]:
    """Calculate hourly, daily, monthly, and static-vs-autoscaled savings in INR."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    hourly_cost = round(active_servers * COST_PER_SERVER_HOUR, 2)
    daily_cost = round(hourly_cost * 24, 2)
    monthly_cost = round(daily_cost * 30, 2)

    baseline_servers = max(STATIC_PEAK_SERVERS, active_servers)
    cost_without_optimization = round(baseline_servers * COST_PER_SERVER_HOUR * 24, 2)
    cost_with_optimization = daily_cost
    cost_saved_daily = round(max(0.0, cost_without_optimization - cost_with_optimization), 2)
    savings_percent = (
        round((cost_saved_daily / cost_without_optimization) * 100, 2)
        if cost_without_optimization > 0
        else 0.0
    )

    return {
        "timestamp": timestamp,
        "active_servers": active_servers,
        "hourly_cost": hourly_cost,
        "daily_cost": daily_cost,
        "monthly_cost": monthly_cost,
        "cost_without_optimization": cost_without_optimization,
        "cost_with_optimization": cost_with_optimization,
        "cost_saved_daily": cost_saved_daily,
        "savings_percent": savings_percent,
    }
