import os
import json
import uuid
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore, storage

_db = None
_bucket = None


def init_firebase():
    global _db, _bucket

    creds_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if not creds_json:
        raise RuntimeError("FIREBASE_CREDENTIALS_JSON non impostato")

    cred_dict = json.loads(creds_json)
    cred = credentials.Certificate(cred_dict)

    bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET")
    firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})

    _db = firestore.client()
    _bucket = storage.bucket()


def upload_photo(file_bytes: bytes, camera_id: str, timestamp: datetime) -> str:
    ts_str = timestamp.strftime("%Y%m%dT%H%M%SZ")
    blob_path = f"photos/{camera_id}/{ts_str}_{uuid.uuid4().hex[:8]}.jpg"

    blob = _bucket.blob(blob_path)
    blob.upload_from_string(file_bytes, content_type="image/jpeg")
    blob.make_public()

    return blob.public_url


def get_camera_owner(camera_id: str) -> str | None:
    """
    Restituisce `owner_uid` della camera, o `None` se la camera non esiste
    o non è ancora stata rivendicata. Usato per verificare l'ownership
    prima di accettare upload.
    """
    doc = _db.collection("cameras").document(camera_id).get()
    if not doc.exists:
        return None
    return doc.to_dict().get("owner_uid")


def save_detection(
    camera_id: str,
    timestamp: datetime,
    people_count: int,
    photo_url: str,
    owner_uid: str,
    boxes: list[dict] | None = None,
    img_width: int | None = None,
    img_height: int | None = None,
) -> str:
    doc_ref = _db.collection("detections").document()
    payload = {
        "camera_id": camera_id,
        "owner_uid": owner_uid,
        "timestamp": timestamp,
        "people_count": people_count,
        "photo_url": photo_url,
    }
    if boxes is not None:
        payload["boxes"] = boxes
    if img_width is not None:
        payload["img_width"] = img_width
    if img_height is not None:
        payload["img_height"] = img_height
    doc_ref.set(payload)
    return doc_ref.id


def upsert_camera(camera_id: str, timestamp: datetime) -> None:
    """Aggiorna solo `last_seen` su una camera già esistente.
    Non crea il documento: la camera deve essere già stata rivendicata
    dal client (mobile o dashboard) tramite transazione che imposta
    `owner_uid`. Usa update() per fallire silenziosamente se manca."""
    try:
        _db.collection("cameras").document(camera_id).update(
            {"last_seen": timestamp}
        )
    except Exception:
        # Camera non rivendicata -> ignora (non vogliamo che l'Admin SDK
        # ne crei una senza owner_uid)
        pass


def get_alert_rules(camera_id: str) -> list[dict]:
    """
    Restituisce le regole di alert attive per la camera, filtrate per
    proprietario della camera (cameras/{id}.owner_uid). Se la camera non ha
    owner_uid (mai rivendicata), nessuna regola è considerata: evita che
    chiunque conoscendo l'id della camera possa ricevere alert su di essa.
    """
    cam_doc = _db.collection("cameras").document(camera_id).get()
    cam_owner = None
    if cam_doc.exists:
        cam_owner = cam_doc.to_dict().get("owner_uid")

    if cam_owner is None:
        return []

    docs = (
        _db.collection("alert_rules")
        .where("camera_id", "==", camera_id)
        .where("active", "==", True)
        .where("owner_uid", "==", cam_owner)
        .stream()
    )
    rules = []
    for doc in docs:
        rule = doc.to_dict()
        rule["id"] = doc.id
        rules.append(rule)
    return rules


def update_alert_last_sent(rule_id: str, timestamp: datetime):
    _db.collection("alert_rules").document(rule_id).update(
        {"last_alert_sent": timestamp}
    )
