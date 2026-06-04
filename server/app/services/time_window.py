from datetime import time as dtime


def _parse_hhmm(s: str) -> dtime:
    h, m = map(int, s.split(":"))
    return dtime(h, m)


def is_in_time_window(now_time, start_str: str, end_str: str) -> bool:
    """
    Verifica se now_time è nella finestra [start_str, end_str].
    Gestisce correttamente le finestre che attraversano la mezzanotte (es. 23:00-06:00).
    """
    start = _parse_hhmm(start_str)
    end = _parse_hhmm(end_str)
    t = now_time.time() if hasattr(now_time, "time") and not isinstance(now_time, dtime) else now_time

    if start <= end:
        return start <= t <= end
    return t >= start or t <= end
