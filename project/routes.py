"""
routes.py
Flask Blueprint defining authentication, dashboard, simulation API,
report preview, and ReportLab PDF export endpoints.
"""

import random
from datetime import datetime
from functools import wraps
from flask import (
    Blueprint,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from services.database import (
    get_dashboard_history,
    log_simulation_step,
    verify_admin,
)
from services.prediction import predict_future_cpu
from services.report_generator import generate_pdf_report
from services.scaler import calculate_cost_metrics, evaluate_auto_scaling

main_bp = Blueprint("main", __name__)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin_user"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("main.login"))
        return fn(*args, **kwargs)

    return wrapper


@main_bp.route("/")
def index():
    if session.get("admin_user"):
        return redirect(url_for("main.dashboard"))
    return redirect(url_for("main.login"))


@main_bp.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        admin = verify_admin(username, password)
        if admin:
            session["admin_user"] = admin["username"]
            session["admin_role"] = admin["role"]
            return redirect(url_for("main.dashboard"))
        error = "Invalid username or password."
    return render_template("login.html", error=error)


@main_bp.route("/logout", methods=["POST", "GET"])
def logout():
    session.clear()
    return redirect(url_for("main.login"))


@main_bp.route("/dashboard")
@login_required
def dashboard():
    history = get_dashboard_history(limit=20)
    return render_template(
        "dashboard.html",
        admin_user=session.get("admin_user", "admin"),
        history=history,
    )


@main_bp.route("/report")
@login_required
def report():
    history = get_dashboard_history(limit=25)
    latest_resource = history["resource_logs"][-1]
    latest_prediction = history["predictions"][-1]
    latest_scaling = history["scaling_history"][-1]
    latest_cost = history["cost_history"][-1]
    return render_template(
        "report.html",
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        resource=latest_resource,
        prediction=latest_prediction,
        scaling=latest_scaling,
        cost=latest_cost,
        scaling_history=history["scaling_history"],
    )


@main_bp.route("/api/telemetry", methods=["GET"])
@login_required
def api_telemetry():
    history = get_dashboard_history(limit=20)
    return jsonify(history)


@main_bp.route("/api/simulate", methods=["POST"])
@login_required
def api_simulate():
    payload = request.get_json(silent=True) or {}
    mode = payload.get("mode", "normal").lower()
    history = get_dashboard_history(limit=1)
    current_servers = history["resource_logs"][-1]["server_count"]
    current_storage = history["resource_logs"][-1]["storage_usage"]

    if mode == "normal":
        cpu = round(random.uniform(20.0, 60.0), 2)
        ram = round(random.uniform(35.0, 62.0), 2)
        users = random.randint(180, 460)
        network = round(users * 0.75 + random.uniform(-15, 20), 2)
        label = "Normal"
    elif mode == "heavy":
        cpu = round(random.uniform(60.0, 85.0), 2)
        ram = round(random.uniform(60.0, 82.0), 2)
        users = random.randint(480, 760)
        network = round(users * 0.8 + random.uniform(-10, 25), 2)
        label = "Heavy"
    elif mode == "peak":
        cpu = round(random.uniform(85.0, 100.0), 2)
        ram = round(random.uniform(78.0, 95.0), 2)
        users = random.randint(820, 1180)
        network = round(users * 0.85 + random.uniform(0, 35), 2)
        label = "Peak"
    else:
        return jsonify({"error": "Invalid simulation mode"}), 400

    storage = round(min(95.0, max(45.0, current_storage + random.uniform(-0.8, 1.2))), 2)
    predicted_cpu, r2_score_val, mae_val = predict_future_cpu(
        cpu, ram, current_servers, network, users
    )

    scaling = evaluate_auto_scaling(current_servers, predicted_cpu, cpu)
    cost = calculate_cost_metrics(scaling["new_servers"])
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    resource = {
        "timestamp": now,
        "cpu_usage": cpu,
        "ram_usage": ram,
        "storage_usage": storage,
        "server_count": scaling["new_servers"],
        "network_load": network,
        "users_count": users,
        "traffic_mode": label,
    }
    prediction = {
        "timestamp": now,
        "actual_cpu": cpu,
        "predicted_cpu": predicted_cpu,
        "r2_score": r2_score_val,
        "mae": mae_val,
    }

    log_simulation_step(resource, prediction, scaling, cost)
    updated_history = get_dashboard_history(limit=20)
    return jsonify(
        {
            "resource": resource,
            "prediction": prediction,
            "scaling": scaling,
            "cost": cost,
            "history": updated_history,
        }
    )


@main_bp.route("/api/report/pdf", methods=["GET"])
@login_required
def api_report_pdf():
    history = get_dashboard_history(limit=20)
    pdf_buffer = generate_pdf_report(
        latest_resource=history["resource_logs"][-1],
        latest_prediction=history["predictions"][-1],
        latest_scaling=history["scaling_history"][-1],
        latest_cost=history["cost_history"][-1],
        scaling_history=history["scaling_history"],
    )
    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"cloud_scaling_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
    )
