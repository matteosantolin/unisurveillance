import logging
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from .firebase_service import get_alert_rules, update_alert_last_sent
from .time_window import is_in_time_window

logger = logging.getLogger(__name__)
_COOLDOWN_MINUTES = 1


def _send_email(recipient: str, camera_id: str, people_count: int, photo_url: str, timestamp: datetime):
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD")

    if not gmail_user or not gmail_password:
        logger.warning("GMAIL_USER o GMAIL_APP_PASSWORD non impostati, email non inviata")
        return

    ts_str = timestamp.strftime("%d/%m/%Y %H:%M:%S")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[Sorveglianza] Allarme: {people_count} persone rilevate - {camera_id}"
    msg["From"] = gmail_user
    msg["To"] = recipient

    html = f"""
    <h2>Allarme di sorveglianza</h2>
    <p><strong>Telecamera:</strong> {camera_id}</p>
    <p><strong>Orario:</strong> {ts_str}</p>
    <p><strong>Persone rilevate:</strong> {people_count}</p>
    <p><a href="{photo_url}">Visualizza foto</a></p>
    <img src="{photo_url}" style="max-width:600px;" />
    """
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_password)
            server.sendmail(gmail_user, recipient, msg.as_string())
        logger.info(
            "Email allarme inviata",
            extra={"camera_id": camera_id, "people_count": people_count},
        )
    except Exception:
        logger.exception(
            "Errore invio email", extra={"camera_id": camera_id}
        )


def check_and_send_alerts(
    camera_id: str,
    people_count: int,
    photo_url: str,
    timestamp: datetime,
):
    rules = get_alert_rules(camera_id)
    now_utc = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)

    for rule in rules:
        # Controlla soglia
        if people_count < rule.get("threshold", 1):
            continue

        # Controlla finestra oraria (in UTC per semplicità; adatta il fuso se necessario)
        start_time = rule.get("start_time", "00:00")
        end_time = rule.get("end_time", "23:59")
        if not is_in_time_window(now_utc, start_time, end_time):
            continue

        # Controlla cooldown
        last_sent = rule.get("last_alert_sent")
        if last_sent:
            # Firestore restituisce datetime aware
            last_sent_dt = last_sent if hasattr(last_sent, "tzinfo") else last_sent
            if (now_utc - last_sent_dt) < timedelta(minutes=_COOLDOWN_MINUTES):
                logger.info(
                    "Cooldown attivo, skip",
                    extra={"rule_id": rule["id"], "camera_id": camera_id},
                )
                continue

        # Invia email
        _send_email(
            recipient=rule.get("recipient_email", ""),
            camera_id=camera_id,
            people_count=people_count,
            photo_url=photo_url,
            timestamp=now_utc,
        )

        # Aggiorna last_alert_sent
        update_alert_last_sent(rule["id"], now_utc)
