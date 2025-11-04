import os, json, io
import boto3
from botocore.client import Config

def _client():
    account_id = os.getenv("R2_ACCOUNT_ID")
    ak = os.getenv("R2_ACCESS_KEY_ID")
    sk = os.getenv("R2_SECRET_ACCESS_KEY")
    if not (account_id and ak and sk):
        raise RuntimeError("R2 credentials missing")
    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
        config=Config(signature_version="s3v4"),
    )

def put_json(bucket: str, key: str, data: dict | list):
    body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    _client().put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json; charset=utf-8")

def get_json(bucket: str, key: str):
    try:
        obj = _client().get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except _client().exceptions.NoSuchKey:
        return []
    except Exception:
        return []

def put_bytes(bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream"):
    _client().put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)

def get_bytes(bucket: str, key: str) -> bytes | None:
    try:
        obj = _client().get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except _client().exceptions.NoSuchKey:
        return None

def list_keys(bucket: str, prefix: str = "") -> list[str]:
    s3 = _client()
    keys = []
    token = None
    while True:
        resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, ContinuationToken=token) if token else \
               s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        for it in resp.get("Contents", []):
            keys.append(it["Key"])
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
    return keys
