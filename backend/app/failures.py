from __future__ import annotations


class AdapterFailure(Exception):
    def __init__(self, adapter: str, kind: str, message: str, inner: Exception | None = None) -> None:
        super().__init__(message)
        self.adapter = adapter
        self.kind = kind
        self.inner = inner


class ConfigFailure(AdapterFailure):
    def __init__(self, adapter: str, message: str, inner: Exception | None = None) -> None:
        super().__init__(adapter, "config", message, inner)


class AuthFailure(AdapterFailure):
    def __init__(self, adapter: str, message: str, inner: Exception | None = None) -> None:
        super().__init__(adapter, "auth", message, inner)


class TransientFailure(AdapterFailure):
    def __init__(self, adapter: str, message: str, inner: Exception | None = None) -> None:
        super().__init__(adapter, "transient", message, inner)
