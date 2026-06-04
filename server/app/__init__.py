from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from .logging_config import configure_logging
from .services.firebase_service import init_firebase
from .services.detection import init_model


def create_app():
    app = Flask(__name__)
    configure_logging(app)
    CORS(app, origins=["https://unisurveillance.web.app", "http://localhost:5173"])

    init_firebase()
    init_model()

    from .routes.upload import upload_bp
    from .routes.health import health_bp

    app.register_blueprint(upload_bp)
    app.register_blueprint(health_bp)

    return app
