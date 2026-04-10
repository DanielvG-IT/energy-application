from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from urllib.parse import urlparse

from .models import RuntimeEnergySettings


class RuntimeEnergySettingsStore:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._current = RuntimeEnergySettings()
        self._ensure_schema()
        loaded = self._try_load()
        if loaded is not None:
            self._current = loaded

    def get(self) -> RuntimeEnergySettings:
        with self._lock:
            return RuntimeEnergySettings.model_validate(self._current.model_dump())

    def update(self, updated: RuntimeEnergySettings) -> RuntimeEnergySettings:
        with self._lock:
            normalized = self._normalize(updated)
            self._validate(normalized)
            self._current = normalized
            self._try_save()
            return RuntimeEnergySettings.model_validate(self._current.model_dump())

    def _ensure_schema(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS RuntimeSettings (
                    Id INTEGER PRIMARY KEY CHECK (Id = 1),
                    Json TEXT NOT NULL,
                    UpdatedUtc TEXT NOT NULL
                );
                """
            )

    def _try_load(self) -> RuntimeEnergySettings | None:
        try:
            with sqlite3.connect(self._db_path) as conn:
                row = conn.execute("SELECT Json FROM RuntimeSettings WHERE Id = 1 LIMIT 1;").fetchone()
                if not row or not row[0]:
                    return None
                data = json.loads(row[0])
                return self._normalize(RuntimeEnergySettings.model_validate(data))
        except Exception:
            return None

    def _try_save(self) -> None:
        try:
            with sqlite3.connect(self._db_path) as conn:
                payload = json.dumps(self._current.model_dump(mode="json"), indent=2)
                conn.execute(
                    """
                    INSERT INTO RuntimeSettings (Id, Json, UpdatedUtc)
                    VALUES (1, ?, datetime('now'))
                    ON CONFLICT(Id) DO UPDATE SET
                      Json = excluded.Json,
                      UpdatedUtc = excluded.UpdatedUtc;
                    """,
                    (payload,),
                )
                conn.commit()
        except Exception:
            return

    @staticmethod
    def _normalize(options: RuntimeEnergySettings) -> RuntimeEnergySettings:
        options.pollingSeconds = max(5, min(30, options.pollingSeconds))
        options.smartMeterBaseUrl = (options.smartMeterBaseUrl or "").strip()
        options.smaInverterBaseUrl = (options.smaInverterBaseUrl or "").strip()
        options.smaGroup = (options.smaGroup or "user").strip().lower()
        options.smaExpectedSerial = (options.smaExpectedSerial or "").strip()
        options.enphaseInverterBaseUrl = (options.enphaseInverterBaseUrl or "").strip()
        options.enphaseUsername = (options.enphaseUsername or "").strip()
        options.enphasePassword = options.enphasePassword or ""
        options.smaMeterUsername = options.smaMeterUsername or "installer"
        options.smaMeterPassword = options.smaMeterPassword or "installer"
        options.smaLoginRight = "istl" if options.smaGroup == "installer" else "usr"
        options.smaPvPowerKey = (options.smaPvPowerKey or "6100_0046C200").strip()
        options.enphaseToken = options.enphaseToken or ""
        options.enphaseSessionId = options.enphaseSessionId or ""
        return options

    @staticmethod
    def _validate(options: RuntimeEnergySettings) -> None:
        RuntimeEnergySettingsStore._validate_optional_http_url(options.smartMeterBaseUrl, "smartMeterBaseUrl")
        RuntimeEnergySettingsStore._validate_optional_host_or_http_url(options.smaInverterBaseUrl, "smaInverterBaseUrl")
        RuntimeEnergySettingsStore._validate_optional_host_or_http_url(
            options.enphaseInverterBaseUrl,
            "enphaseInverterBaseUrl",
        )

        if options.smaGroup not in {"user", "installer"}:
            raise ValueError("smaGroup must be either 'user' or 'installer'.")

    @staticmethod
    def _validate_optional_http_url(value: str, property_name: str) -> None:
        if not value:
            return
        uri = urlparse(value)
        if uri.scheme not in {"http", "https"} or not uri.netloc:
            raise ValueError(f"{property_name} must be a valid absolute http/https URL.")

    @staticmethod
    def _validate_optional_host_or_http_url(value: str, property_name: str) -> None:
        if not value:
            return
        uri = urlparse(value)
        if uri.scheme:
            if uri.scheme in {"http", "https"} and uri.netloc:
                return
            raise ValueError(f"{property_name} absolute URL must use http/https.")

        if " " in value or "/" in value:
            raise ValueError(f"{property_name} must be a host/IP or absolute http/https URL.")
