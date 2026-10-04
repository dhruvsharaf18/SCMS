"""RSA-OAEP login-key store.

A single in-memory key pair is kept alive for KEY_LIFETIME_SECONDS (10 min).
Once a new pair is generated the old one stays valid for GRACE_SECONDS (5 min)
so that a page loaded just before rotation can still log in.

The public key is serialised as SPKI-DER-then-base64, ready for the browser's
SubtleCrypto.importKey('spki', …).

Thread safety: all mutations are inside a threading.Lock, so multiple worker
threads (uvicorn --workers > 1 would need an external store, but the default
single-worker setup is fine).
"""

from __future__ import annotations

import base64
import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

# ---------------------------------------------------------------------------
KEY_BITS = 3072
KEY_LIFETIME_SECONDS = 600   # 10 min
GRACE_SECONDS = 300           # 5 min — old key stays valid this long after rotation
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


@dataclass
class _KeySlot:
    key_id: str
    private_key: rsa.RSAPrivateKey
    expires_at: datetime          # when this slot stops being the *current* key
    grace_until: datetime         # when this slot is fully retired (decryption disabled)

    def is_current(self, now: datetime) -> bool:
        return now < self.expires_at

    def is_usable(self, now: datetime) -> bool:
        """True while decryption is still allowed (current + grace window)."""
        return now < self.grace_until

    @property
    def public_key_spki_b64(self) -> str:
        der = self.private_key.public_key().public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return base64.b64encode(der).decode()


class KeyStore:
    """Holds the current slot plus (optionally) the previous one during grace."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._current: _KeySlot = self._new_slot()
        self._previous: _KeySlot | None = None

    # ------------------------------------------------------------------ public

    def current_key_info(self) -> dict:
        """Return the info dict sent to the browser on GET /auth/login-key."""
        with self._lock:
            self._maybe_rotate()
            slot = self._current
        return {
            "key_id": slot.key_id,
            "public_key_spki_b64": slot.public_key_spki_b64,
            "expires_at": slot.expires_at.isoformat().replace("+00:00", "Z"),
        }

    def decrypt(self, key_id: str, ciphertext_b64: str) -> bytes:
        """Decrypt *ciphertext_b64* using the slot identified by *key_id*.

        Returns the raw plaintext bytes.
        Raises ValueError if the key_id is unknown / expired or decryption fails.
        """
        with self._lock:
            self._maybe_rotate()
            slot = self._find_slot(key_id)

        if slot is None:
            raise ValueError("Unknown or expired key_id")

        try:
            ciphertext = base64.b64decode(ciphertext_b64)
        except Exception as exc:
            raise ValueError("Invalid base64 ciphertext") from exc

        try:
            return slot.private_key.decrypt(
                ciphertext,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
        except Exception as exc:
            raise ValueError("Decryption failed") from exc

    # ----------------------------------------------------------------- private

    @staticmethod
    def _new_slot() -> _KeySlot:
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=KEY_BITS,
        )
        now = _utcnow()
        return _KeySlot(
            key_id=secrets.token_urlsafe(16),
            private_key=private_key,
            expires_at=now + timedelta(seconds=KEY_LIFETIME_SECONDS),
            grace_until=now + timedelta(seconds=KEY_LIFETIME_SECONDS + GRACE_SECONDS),
        )

    def _maybe_rotate(self) -> None:
        """Called under lock. Rotate if the current slot has expired."""
        now = _utcnow()
        if not self._current.is_current(now):
            self._previous = self._current
            self._current = self._new_slot()
        # Retire previous once its grace window closes.
        if self._previous and not self._previous.is_usable(now):
            self._previous = None

    def _find_slot(self, key_id: str) -> _KeySlot | None:
        """Return the slot matching *key_id* if still usable, else None."""
        now = _utcnow()
        if self._current.key_id == key_id and self._current.is_usable(now):
            return self._current
        if self._previous and self._previous.key_id == key_id and self._previous.is_usable(now):
            return self._previous
        return None


# Module-level singleton — created once when the module is first imported.
key_store = KeyStore()
