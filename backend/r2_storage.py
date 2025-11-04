# r2_storage.py
import os
import json
import io
from typing import Optional, List

# boto3 is optional locally; we enable R2 only if boto3 + creds are present
try:
    import boto3
    from botocore.client import Config
    _HAS_BOTO3 = True
except Exception:
    boto3 = None  # type: ignore
    Config = None  # type: ignore
    _HAS_BOTO3 = False

# ---- public constants taken from env (with sensible defaults) ----
R2_BUCKET_DATA  = os.getenv("R2_BUCKET_DATA",  "telemetry-data-files")
R2_DATA_PREFIX  = os.getenv("R2_DATA_PREFIX",  "data/")

# internal cached client
_S3_CLIENT = None

def _have_creds() -> bool:
    return all([
        os.getenv("R2_ACCOUNT_ID"),
        os.getenv("R2_ACCESS_KEY_ID"),
        os.getenv("R2_SECRET_ACCESS_KEY"),
    ])

# feature flag: env + boto3 + creds
_R2_ENABLED = (
    os.getenv("R2_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
    and _HAS_BOTO3
    and _have_creds()
)

def is_r2_enabled() -> bool:
    """Public check used by the rest of the app."""
    return _R2_ENABLED

def _client():
    """Create or return a cached R2 S3-compatible client."""
    global _S3_CLIENT
    if not is_r2_enabled():
        raise RuntimeError("R2 is not enabled (check env, boto3 installation, and credentials).")

    if _S3_CLIENT is not None:
        return _S3_CLIENT

    account_id = os.getenv("R2_ACCOUNT_ID")
    ak         = os.getenv("R2_ACCESS_KEY_ID")
    sk         = os.getenv("R2_SECRET_ACCESS_KEY")

    _S3_CLIENT = boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
        config=Config(signature_version="s3v4"),
    )
    return _S3_CLIENT

# ---------------- basic helpers ----------------

def put_json(bucket: str, key: str, data):
    """Write a JSON object/list to R2."""
    body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    _client().put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json; charset=utf-8")

def get_json(bucket: str, key: str):
    """Read JSON, return [] if not found or on error (safe default for your code)."""
    try:
        obj = _client().get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception:
        return []

def put_bytes(bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream"):
    _client().put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)

def get_bytes(bucket: str, key: str) -> Optional[bytes]:
    try:
        obj = _client().get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except Exception:
        return None

def list_keys(bucket: str, prefix: str = "") -> List[str]:
    s3 = _client()
    keys: List[str] = []
    token = None
    while True:
        if token:
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, ContinuationToken=token)
        else:
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        for it in resp.get("Contents", []):
            keys.append(it["Key"])
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    return keys

# ---------------- simple CSV buffered logger ----------------

class R2BufferedCSVLogger:
    """
    Minimal CSV buffer that periodically overwrites the remote object with the current buffer.
    (R2/S3 has no true append; this is acceptable for moderate rates and small files.)
    """
    def __init__(self, bucket: str, key: str, flush_bytes: int = 32_768):
        self.bucket     = bucket
        self.key        = key
        self.flush_bytes= flush_bytes
        self._buf       = io.StringIO()

    def write_row(self, row: str):
        """
        Provide a fully formatted CSV row string (without trailing newline).
        We'll add '\n' and flush when threshold exceeded.
        """
        self._buf.write(row)
        if not row.endswith("\n"):
            self._buf.write("\n")
        if self._buf.tell() >= self.flush_bytes:
            self.flush()

    def flush(self):
        data = self._buf.getvalue().encode("utf-8")
        if data:
            put_bytes(self.bucket, self.key, data, content_type="text/csv; charset=utf-8")

    def close(self):
        try:
            self.flush()
        finally:
            self._buf.close()
