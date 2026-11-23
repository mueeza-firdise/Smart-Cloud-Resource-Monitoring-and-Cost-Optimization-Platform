"""
services/report_generator.py
Generates downloadable PDF summary reports using ReportLab.
"""

import io
from datetime import datetime
from typing import Dict, Any, List
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def generate_pdf_report(
    latest_resource: Dict[str, Any],
    latest_prediction: Dict[str, Any],
    latest_scaling: Dict[str, Any],
    latest_cost: Dict[str, Any],
    scaling_history: List[Dict[str, Any]],
) -> io.BytesIO:
    """Build a structured PDF audit report in memory and return BytesIO buffer."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=6,
    )
    section_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=14,
        spaceAfter=6,
    )
    normal = styles["Normal"]

    elements = []
    elements.append(
        Paragraph("AI-Powered Cloud Resource Monitoring & Auto-Scaling Report", title_style)
    )
    elements.append(
        Paragraph(
            f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Traffic Profile: {latest_resource.get('traffic_mode', 'Normal')}",
            normal,
        )
    )
    elements.append(Spacer(1, 12))

    # 1. Current Resources & ML Prediction
    elements.append(Paragraph("1. Current Cloud Telemetry & ML Prediction", section_style))
    resource_table_data = [
        ["Metric", "Current Value", "Status / Notes"],
        ["CPU Usage", f"{latest_resource['cpu_usage']:.2f}%", "Measured host utilization"],
        ["RAM Usage", f"{latest_resource['ram_usage']:.2f}%", "Allocated memory footprint"],
        ["Storage Usage", f"{latest_resource['storage_usage']:.2f}%", "Persistent volume pool"],
        ["Active Servers", f"{latest_resource['server_count']} nodes", "Bounds: 2 min / 20 max"],
        ["Network Load", f"{latest_resource['network_load']:.2f} Mbps", f"{latest_resource['users_count']} active users"],
        [
            "Predicted Future CPU",
            f"{latest_prediction['predicted_cpu']:.2f}%",
            f"Linear Regression (R2={latest_prediction['r2_score']}, MAE={latest_prediction['mae']}%)",
        ],
    ]
    t1 = Table(resource_table_data, colWidths=[2.1 * inch, 1.6 * inch, 3.2 * inch])
    t1.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("PADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    elements.append(t1)

    # 2. Scaling Decision
    elements.append(Paragraph("2. Latest Auto-Scaling Decision", section_style))
    elements.append(
        Paragraph(
            f"Action: <b>{latest_scaling['action']}</b> | Servers: {latest_scaling['previous_servers']} -> {latest_scaling['new_servers']} (Delta: {latest_scaling['delta']:+d})<br/>Rationale: {latest_scaling['reason']}",
            normal,
        )
    )

    # 3. Cost Optimization Analysis
    elements.append(Paragraph("3. Cost Optimization Analysis (INR 10 / Server / Hour)", section_style))
    cost_data = [
        ["Cost Component", "Amount (INR)"],
        ["Current Hourly Cost", f"INR {latest_cost['hourly_cost']:.2f}/hr"],
        ["Daily Cost (With Auto-Scaling)", f"INR {latest_cost['daily_cost']:.2f}/day"],
        ["Monthly Projected Cost", f"INR {latest_cost['monthly_cost']:.2f}/month"],
        ["Cost Without Optimization (Static Peak)", f"INR {latest_cost['cost_without_optimization']:.2f}/day"],
        ["Daily Cost Saved", f"INR {latest_cost['cost_saved_daily']:.2f}/day ({latest_cost['savings_percent']:.1f}%)"],
    ]
    t2 = Table(cost_data, colWidths=[3.5 * inch, 3.4 * inch])
    t2.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("PADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    elements.append(t2)

    # 4. Recent Scaling History
    elements.append(Paragraph("4. Recent Scaling Audit Log", section_style))
    hist_rows = [["Timestamp", "Action", "Servers", "Predicted CPU", "Reason"]]
    for item in scaling_history[-8:]:
        hist_rows.append(
            [
                item["timestamp"],
                item["action"],
                f"{item['previous_servers']} -> {item['new_servers']}",
                f"{item['predicted_cpu']:.1f}%",
                item["reason"][:46],
            ]
        )
    t3 = Table(hist_rows, colWidths=[1.4 * inch, 0.9 * inch, 0.9 * inch, 1.0 * inch, 2.7 * inch])
    t3.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    elements.append(t3)

    doc.build(elements)
    buffer.seek(0)
    return buffer
