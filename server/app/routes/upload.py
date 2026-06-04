from datetime import datetime, timezone

from flask import Blueprint, current_app, g, jsonify, request

from ..middleware.auth import require_auth
from ..services.alert_service import check_and_send_alerts
from ..services.detection import detect_people
from ..services.firebase_service import (
    get_camera_owner,
    save_detection,
    upload_photo,
    upsert_camera,
)

upload_bp = Blueprint("upload", __name__)


@upload_bp.route("/upload", methods=["POST"])
@require_auth
def upload():
    """
    Riceve una foto dal client mobile autenticato.

    Headers:
      Authorization: Bearer <Firebase ID token>

    Form-data:
      photo:     file immagine JPEG
      camera_id: identificativo telecamera (deve essere già rivendicato
                 dall'utente autenticato)

    Risposte:
      200 detection processata + JSON {success, doc_id, people_count, ...}
      400 input mancante o malformato
      401 token assente / non valido (gestito dal decoratore)
      403 camera non rivendicata o appartenente a un altro utente
      500 errori interni (detection, storage, firestore)
    """
    uid: str = g.uid

    if "photo" not in request.files:
        return jsonify({"error": "Campo 'photo' mancante"}), 400

    camera_id = (request.form.get("camera_id") or "").strip()
    if not camera_id:
        return jsonify({"error": "Campo 'camera_id' mancante"}), 400

    log_extra = {"camera_id": camera_id, "uid": uid}

    # --- Ownership check PRIMA di qualunque lavoro pesante (YOLO/Storage) ---
    try:
        owner = get_camera_owner(camera_id)
    except Exception:
        current_app.logger.exception("Errore lookup owner camera", extra=log_extra)
        return jsonify({"error": "Errore lookup camera"}), 500

    if owner is None:
        current_app.logger.warning(
            "Upload rifiutato: camera non rivendicata", extra=log_extra
        )
        return jsonify({"error": "Camera non registrata"}), 403

    if owner != uid:
        current_app.logger.warning(
            "Upload rifiutato: camera appartiene a un altro utente",
            extra={**log_extra, "owner": owner},
        )
        return jsonify({"error": "Camera non autorizzata"}), 403

    # --- Detection + persistenza ---
    photo_file = request.files["photo"]
    image_bytes = photo_file.read()
    timestamp = datetime.now(timezone.utc)

    try:
        result = detect_people(image_bytes)
    except Exception:
        current_app.logger.exception("Errore rilevamento YOLO", extra=log_extra)
        return jsonify({"error": "Errore rilevamento"}), 500

    people_count = result["count"]

    try:
        photo_url = upload_photo(image_bytes, camera_id, timestamp)
    except Exception:
        current_app.logger.exception("Errore upload Storage", extra=log_extra)
        return jsonify({"error": "Errore upload Storage"}), 500

    try:
        doc_id = save_detection(
            camera_id=camera_id,
            timestamp=timestamp,
            people_count=people_count,
            photo_url=photo_url,
            owner_uid=uid,
            boxes=result["boxes"],
            img_width=result["width"],
            img_height=result["height"],
        )
    except Exception:
        current_app.logger.exception("Errore Firestore", extra=log_extra)
        return jsonify({"error": "Errore Firestore"}), 500

    # Side-effects non bloccanti: log e continua anche se falliscono
    try:
        upsert_camera(camera_id, timestamp)
    except Exception:
        current_app.logger.exception("Errore upsert_camera", extra=log_extra)

    try:
        check_and_send_alerts(camera_id, people_count, photo_url, timestamp)
    except Exception:
        current_app.logger.exception(
            "Errore check_and_send_alerts",
            extra={**log_extra, "people_count": people_count},
        )

    current_app.logger.info(
        "Detection salvata",
        extra={**log_extra, "people_count": people_count, "doc_id": doc_id},
    )

    return jsonify(
        {
            "success": True,
            "doc_id": doc_id,
            "people_count": people_count,
            "photo_url": photo_url,
            "timestamp": timestamp.isoformat(),
        }
    ), 200
