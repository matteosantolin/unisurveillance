import importlib.util
import pathlib
import sys
import types
from datetime import datetime, time, timedelta, timezone
from unittest.mock import patch

# ---- Carico time_window.py via path-load: evita di importare l'app Flask
# intera (e dipendenze pesanti) per testare la logica pura.
_BASE = pathlib.Path(__file__).resolve().parent.parent / "app" / "services"

_spec_tw = importlib.util.spec_from_file_location("time_window", _BASE / "time_window.py")
_tw = importlib.util.module_from_spec(_spec_tw)
_spec_tw.loader.exec_module(_tw)
is_in_time_window = _tw.is_in_time_window


class TestIsInTimeWindow:
    def test_inside_normal_window(self):
        assert is_in_time_window(time(12, 0), "08:00", "18:00") is True

    def test_outside_normal_window_before(self):
        assert is_in_time_window(time(7, 59), "08:00", "18:00") is False

    def test_outside_normal_window_after(self):
        assert is_in_time_window(time(18, 1), "08:00", "18:00") is False

    def test_boundary_start(self):
        assert is_in_time_window(time(8, 0), "08:00", "18:00") is True

    def test_boundary_end(self):
        assert is_in_time_window(time(18, 0), "08:00", "18:00") is True

    def test_midnight_window_late_night(self):
        assert is_in_time_window(time(23, 30), "23:00", "06:00") is True

    def test_midnight_window_early_morning(self):
        assert is_in_time_window(time(2, 0), "23:00", "06:00") is True

    def test_midnight_window_outside_daytime(self):
        assert is_in_time_window(time(12, 0), "23:00", "06:00") is False

    def test_midnight_window_boundary_start(self):
        assert is_in_time_window(time(23, 0), "23:00", "06:00") is True

    def test_midnight_window_boundary_end(self):
        assert is_in_time_window(time(6, 0), "23:00", "06:00") is True

    def test_midnight_window_just_after_end(self):
        assert is_in_time_window(time(6, 1), "23:00", "06:00") is False

    def test_same_start_end(self):
        assert is_in_time_window(time(10, 0), "10:00", "10:00") is True
        assert is_in_time_window(time(10, 1), "10:00", "10:00") is False

    def test_accepts_datetime_like(self):
        dt = datetime(2026, 4, 29, 14, 30)
        assert is_in_time_window(dt, "08:00", "18:00") is True


# ---- Carico alert_service.py via path-load riscrivendo gli import relativi
# in import assoluti su moduli stub. Così evito di importare l'app Flask
# (CORS, firebase-admin, ultralytics) solo per testare la logica di alert.
_fb_stub = types.ModuleType("firebase_service_stub")
_fb_stub.get_alert_rules = lambda *a, **k: []
_fb_stub.update_alert_last_sent = lambda *a, **k: None
sys.modules["firebase_service_stub"] = _fb_stub

sys.modules["time_window_stub"] = _tw

_src = (_BASE / "alert_service.py").read_text(encoding="utf-8")
_src = _src.replace("from .firebase_service import", "from firebase_service_stub import")
_src = _src.replace("from .time_window import", "from time_window_stub import")

alert_service = types.ModuleType("alert_service_under_test")
exec(compile(_src, str(_BASE / "alert_service.py"), "exec"), alert_service.__dict__)


def _base_rule(**overrides):
    rule = {
        "id": "rule-1",
        "camera_id": "cam-01",
        "threshold": 1,
        "start_time": "00:00",
        "end_time": "23:59",
        "recipient_email": "alerts@example.com",
        "active": True,
        "owner_uid": "user-A",
        "last_alert_sent": None,
    }
    rule.update(overrides)
    return rule


class TestCheckAndSendAlerts:
    def test_below_threshold_no_email(self):
        with patch.object(alert_service, "get_alert_rules", return_value=[_base_rule(threshold=5)]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts(
                "cam-01", 2, "http://photo", datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
            )
            mock_send.assert_not_called()
            mock_upd.assert_not_called()

    def test_above_threshold_in_window_sends_email(self):
        with patch.object(alert_service, "get_alert_rules", return_value=[_base_rule(threshold=2)]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            ts = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
            alert_service.check_and_send_alerts("cam-01", 3, "http://photo", ts)
            mock_send.assert_called_once()
            mock_upd.assert_called_once_with("rule-1", ts)

    def test_outside_time_window_no_email(self):
        # Finestra notturna 22:00-06:00 UTC, timestamp alle 12:00 UTC -> fuori
        with patch.object(alert_service, "get_alert_rules",
                          return_value=[_base_rule(start_time="22:00", end_time="06:00")]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts(
                "cam-01", 5, "http://photo", datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
            )
            mock_send.assert_not_called()
            mock_upd.assert_not_called()

    def test_within_cooldown_skip(self):
        ts = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
        recent = ts - timedelta(seconds=30)  # cooldown è 1 min
        with patch.object(alert_service, "get_alert_rules",
                          return_value=[_base_rule(last_alert_sent=recent)]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts("cam-01", 5, "http://photo", ts)
            mock_send.assert_not_called()
            mock_upd.assert_not_called()

    def test_after_cooldown_sends_email(self):
        ts = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
        old = ts - timedelta(minutes=5)
        with patch.object(alert_service, "get_alert_rules",
                          return_value=[_base_rule(last_alert_sent=old)]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts("cam-01", 5, "http://photo", ts)
            mock_send.assert_called_once()
            mock_upd.assert_called_once()

    def test_multiple_rules_processed_independently(self):
        rule_in = _base_rule(id="r1", threshold=1)
        rule_out = _base_rule(id="r2", threshold=10)
        ts = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
        with patch.object(alert_service, "get_alert_rules", return_value=[rule_in, rule_out]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts("cam-01", 3, "http://photo", ts)
            assert mock_send.call_count == 1
            mock_upd.assert_called_once_with("r1", ts)

    def test_no_rules_no_action(self):
        with patch.object(alert_service, "get_alert_rules", return_value=[]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent") as mock_upd:
            alert_service.check_and_send_alerts(
                "cam-01", 99, "http://photo", datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
            )
            mock_send.assert_not_called()
            mock_upd.assert_not_called()

    def test_naive_timestamp_treated_as_utc(self):
        with patch.object(alert_service, "get_alert_rules", return_value=[_base_rule(threshold=1)]), \
             patch.object(alert_service, "_send_email") as mock_send, \
             patch.object(alert_service, "update_alert_last_sent"):
            naive = datetime(2026, 5, 7, 12, 0)  # no tzinfo
            alert_service.check_and_send_alerts("cam-01", 3, "http://photo", naive)
            mock_send.assert_called_once()
