"""
One-off: aggiunge il campo `owner_uid` ai documenti `detections` esistenti
che ne sono privi, derivandolo da `cameras/{camera_id}.owner_uid`.

Detection le cui camere non sono state ancora rivendicate vengono lasciate
senza owner: rimarranno invisibili da dashboard (intenzionale).

Uso (richiede FIREBASE_CREDENTIALS_JSON nelle env, come il server):

    cd server
    python -m scripts.backfill_detections_owner_uid

Aggiunge `--dry-run` per simulare senza scrivere.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def _init() -> firestore.Client:
    creds_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
    if not creds_json:
        sys.exit("FIREBASE_CREDENTIALS_JSON non impostato")
    cred = credentials.Certificate(json.loads(creds_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def backfill(dry_run: bool = False) -> None:
    db = _init()
    cameras_cache: dict[str, str | None] = {}

    processed = 0
    updated = 0
    skipped_no_owner = 0
    skipped_already = 0

    for doc in db.collection("detections").stream():
        processed += 1
        data = doc.to_dict()
        if data.get("owner_uid"):
            skipped_already += 1
            continue
        cam_id = data.get("camera_id")
        if not cam_id:
            skipped_no_owner += 1
            continue

        if cam_id not in cameras_cache:
            cam = db.collection("cameras").document(cam_id).get()
            cameras_cache[cam_id] = (
                cam.to_dict().get("owner_uid") if cam.exists else None
            )
        owner = cameras_cache[cam_id]
        if owner is None:
            skipped_no_owner += 1
            continue

        if dry_run:
            print(f"[dry-run] {doc.id} <- owner_uid={owner}")
        else:
            doc.reference.update({"owner_uid": owner})
        updated += 1

    print(
        f"processed={processed} updated={updated} "
        f"skipped_already={skipped_already} skipped_no_owner={skipped_no_owner}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    backfill(dry_run=args.dry_run)
