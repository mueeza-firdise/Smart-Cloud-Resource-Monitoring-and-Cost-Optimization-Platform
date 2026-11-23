"""
app.py
Main entry point for the AI-Powered Cloud Resource Monitoring and Auto-Scaling Simulator.
"""

import os
from flask import Flask
from routes import main_bp
from services.database import init_db
from services.prediction import load_model_bundle


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(32)
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    # Ensure database tables and trained Linear Regression model exist
    init_db()
    load_model_bundle()

    app.register_blueprint(main_bp)
    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
