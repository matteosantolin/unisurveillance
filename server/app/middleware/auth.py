from functools import wraps
from typing import Callable

from flask import current_app, g, jsonify, request
from firebase_admin import auth as fb_auth


def require_auth(fn: Callable) -> Callable:
    """
    Decoratore che valida un ID token Firebase passato come
    `Authorization: Bearer <token>`. In caso di successo popola
    `flask.g.uid` e `flask.g.email`. In caso contrario ritorna 401.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = header[len("Bearer "):].strip()
        if not token:
            return jsonify({"error": "Empty bearer token"}), 401

        try:
            decoded = fb_auth.verify_id_token(token, check_revoked=False)
        except fb_auth.ExpiredIdTokenError:
            return jsonify({"error": "Token expired"}), 401
        except fb_auth.RevokedIdTokenError:
            return jsonify({"error": "Token revoked"}), 401
        except fb_auth.InvalidIdTokenError as exc:
            current_app.logger.warning("Invalid JWT", extra={"err": str(exc)})
            return jsonify({"error": "Invalid token"}), 401
        except Exception:
            current_app.logger.exception("JWT verification error")
            return jsonify({"error": "Unauthorized"}), 401

        g.uid = decoded["uid"]
        g.email = decoded.get("email")
        return fn(*args, **kwargs)

    return wrapper
