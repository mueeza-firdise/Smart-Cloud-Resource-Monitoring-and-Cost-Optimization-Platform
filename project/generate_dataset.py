"""
generate_dataset.py
Generates a realistic synthetic cloud resource utilization dataset (1,080 rows)
and stores it at dataset/resource_usage.csv.
"""

import csv
import math
import os
import random
from datetime import datetime, timedelta


def generate_synthetic_dataset(
    output_path: str = "dataset/resource_usage.csv",
    num_rows: int = 1080,
    seed: int = 42,
) -> str:
    """
    Generate synthetic cloud telemetry rows containing:
    Time, CPU Usage, RAM Usage, Server Count, Network Load, Users Count
    """
    random.seed(seed)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    start_time = datetime(2026, 1, 1, 0, 0, 0)
    rows = []

    prev_cpu = 42.0
    server_count = 3

    for i in range(num_rows):
        ts = start_time + timedelta(hours=i)
        hour = ts.hour
        day_of_week = ts.weekday()

        # Diurnal traffic wave: higher during business & evening hours, lower at night
        diurnal = 0.5 + 0.45 * math.sin((hour - 6) * math.pi / 12.0)
        weekend_factor = 0.82 if day_of_week >= 5 else 1.0

        # Occasional traffic spikes to simulate bursts
        spike = random.uniform(20.0, 38.0) if random.random() < 0.08 else 0.0

        users_count = int(
            max(
                45,
                min(
                    1200,
                    (120 + 620 * diurnal * weekend_factor) + spike * 8 + random.gauss(0, 35),
                ),
            )
        )
        network_load = round(
            max(
                35.0,
                min(980.0, users_count * 0.78 + random.gauss(0, 28.0)),
            ),
            2,
        )

        # Target CPU driven by user load, network traffic, and temporal momentum,
        # mitigated partially by active server count
        load_pressure = (users_count / 11.5) + (network_load / 32.0) - (server_count * 1.4)
        cpu_usage = round(
            max(
                10.0,
                min(99.5, 0.52 * prev_cpu + 0.48 * load_pressure + random.gauss(0, 3.2)),
            ),
            2,
        )

        ram_usage = round(
            max(
                18.0,
                min(96.0, 22.0 + cpu_usage * 0.68 + random.gauss(0, 3.0)),
            ),
            2,
        )

        # Simulated historical auto-scaling adjustments
        if cpu_usage > 90:
            server_count = min(20, server_count + 3)
        elif cpu_usage > 80:
            server_count = min(20, server_count + 2)
        elif cpu_usage < 20:
            server_count = max(2, server_count - 2)
        elif cpu_usage < 30:
            server_count = max(2, server_count - 1)

        rows.append(
            [
                ts.strftime("%Y-%m-%d %H:%M:%S"),
                cpu_usage,
                ram_usage,
                server_count,
                network_load,
                users_count,
            ]
        )
        prev_cpu = cpu_usage

    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "Time",
                "CPU Usage",
                "RAM Usage",
                "Server Count",
                "Network Load",
                "Users Count",
            ]
        )
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows at {output_path}")
    return output_path


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    generate_synthetic_dataset(os.path.join(base_dir, "dataset", "resource_usage.csv"))
