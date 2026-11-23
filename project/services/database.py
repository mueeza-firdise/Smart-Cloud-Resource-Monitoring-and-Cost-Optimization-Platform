"""
services/database.py
SQLite database initialization, schema creation, and parameterized CRUD helpers.
Database path: database/cloud.db
"""

import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "database", "cloud.db")


def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    """Create all 5 required tables and seed default admin & baseline telemetry."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Administrator',
                created_at TEXT NOT NULL
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS resource_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                cpu_usage REAL NOT NULL,
                ram_usage REAL NOT NULL,
                storage_usage REAL NOT NULL,
                server_count INTEGER NOT NULL,
                network_load REAL NOT NULL,
                users_count INTEGER NOT NULL,
                traffic_mode TEXT NOT NULL DEFAULT 'Normal'
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                actual_cpu REAL NOT NULL,
                predicted_cpu REAL NOT NULL,
                r2_score REAL NOT NULL,
                mae REAL NOT NULL
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS cost_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                active_servers INTEGER NOT NULL,
                hourly_cost REAL NOT NULL,
                daily_cost REAL NOT NULL,
                monthly_cost REAL NOT NULL,
                cost_without_optimization REAL NOT NULL,
                cost_with_optimization REAL NOT NULL,
                cost_saved_daily REAL NOT NULL,
                savings_percent REAL NOT NULL
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS scaling_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                previous_servers INTEGER NOT NULL,
                new_servers INTEGER NOT NULL,
                delta INTEGER NOT NULL,
                predicted_cpu REAL NOT NULL,
                action TEXT NOT NULL,
                reason TEXT NOT NULL
            )
            """
        )

        # Seed default admin user if missing
        existing_admin = cursor.execute(
            "SELECT id FROM admins WHERE username = ?", ("admin",)
        ).fetchone()
        if not existing_admin:
            default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "admin123")
            cursor.execute(
                "INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (
                    "admin",
                    generate_password_hash(default_password),
                    "Cloud Administrator",
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )

        # Seed initial demo baseline state (CPU = 45%, Servers = 3) if logs are empty
        log_count = cursor.execute("SELECT COUNT(*) FROM resource_logs").fetchone()[0]
        if log_count == 0:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute(
                """
                INSERT INTO resource_logs
                (timestamp, cpu_usage, ram_usage, storage_usage, server_count, network_load, users_count, traffic_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (now, 45.0, 52.0, 61.5, 3, 280.0, 340, "Normal"),
            )
            cursor.execute(
                """
                INSERT INTO predictions (timestamp, actual_cpu, predicted_cpu, r2_score, mae)
                VALUES (?, ?, ?, ?, ?)
                """,
                (now, 45.0, 47.2, 0.93, 2.84),
            )
            cursor.execute(
                """
                INSERT INTO cost_history
                (timestamp, active_servers, hourly_cost, daily_cost, monthly_cost,
                 cost_without_optimization, cost_with_optimization, cost_saved_daily, savings_percent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (now, 3, 30.0, 720.0, 21600.0, 2160.0, 720.0, 1440.0, 66.67),
            )
            cursor.execute(
                """
                INSERT INTO scaling_history
                (timestamp, previous_servers, new_servers, delta, predicted_cpu, action, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (now, 3, 3, 0, 47.2, "HOLD", "Resource utilization is healthy."),
            )

        conn.commit()


def verify_admin(username: str, password: str, db_path: str = DB_PATH) -> Optional[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, role FROM admins WHERE username = ?",
            (username,),
        ).fetchone()
        if row and check_password_hash(row["password_hash"], password):
            return {"id": row["id"], "username": row["username"], "role": row["role"]}
    return None


def log_simulation_step(
    resource: Dict[str, Any],
    prediction: Dict[str, Any],
    scaling: Dict[str, Any],
    cost: Dict[str, Any],
    db_path: str = DB_PATH,
) -> None:
    with get_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO resource_logs
            (timestamp, cpu_usage, ram_usage, storage_usage, server_count, network_load, users_count, traffic_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                resource["timestamp"],
                resource["cpu_usage"],
                resource["ram_usage"],
                resource["storage_usage"],
                resource["server_count"],
                resource["network_load"],
                resource["users_count"],
                resource["traffic_mode"],
            ),
        )
        cur.execute(
            """
            INSERT INTO predictions (timestamp, actual_cpu, predicted_cpu, r2_score, mae)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                prediction["timestamp"],
                prediction["actual_cpu"],
                prediction["predicted_cpu"],
                prediction["r2_score"],
                prediction["mae"],
            ),
        )
        cur.execute(
            """
            INSERT INTO scaling_history
            (timestamp, previous_servers, new_servers, delta, predicted_cpu, action, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scaling["timestamp"],
                scaling["previous_servers"],
                scaling["new_servers"],
                scaling["delta"],
                scaling["predicted_cpu"],
                scaling["action"],
                scaling["reason"],
            ),
        )
        cur.execute(
            """
            INSERT INTO cost_history
            (timestamp, active_servers, hourly_cost, daily_cost, monthly_cost,
             cost_without_optimization, cost_with_optimization, cost_saved_daily, savings_percent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cost["timestamp"],
                cost["active_servers"],
                cost["hourly_cost"],
                cost["daily_cost"],
                cost["monthly_cost"],
                cost["cost_without_optimization"],
                cost["cost_with_optimization"],
                cost["cost_saved_daily"],
                cost["savings_percent"],
            ),
        )
        conn.commit()


def get_dashboard_history(limit: int = 20, db_path: str = DB_PATH) -> Dict[str, List[Dict[str, Any]]]:
    with get_connection(db_path) as conn:
        logs = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM resource_logs ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        ][::-1]
        preds = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM predictions ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        ][::-1]
        costs = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM cost_history ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        ][::-1]
        scaling = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM scaling_history ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        ][::-1]

    return {
        "resource_logs": logs,
        "predictions": preds,
        "cost_history": costs,
        "scaling_history": scaling,
    }
