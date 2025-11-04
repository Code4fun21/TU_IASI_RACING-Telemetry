import boto3
from botocore.config import Config

ACCOUNT_ID = "4c2c8f6251585eac5db48b7f10224cc1"                # from the R2 dashboard
ACCESS_KEY_ID = "79b0518d200fe132f8b8dafc19515070"
SECRET_ACCESS_KEY = "7475c2c3389742ea1492a07948b620f83b729a19cdb40ebdada739de6a7fb1a2"

BUCKET = "telemetry-db"
OBJECT = "sessions.json"                       # <- change to a real key

endpoint_url = f"https://4c2c8f6251585eac5db48b7f10224cc1.r2.cloudflarestorage.com"

s3 = boto3.client(
    "s3",
    region_name="auto",                        # <-- important for R2
    endpoint_url=endpoint_url,
    aws_access_key_id=ACCESS_KEY_ID,
    aws_secret_access_key=SECRET_ACCESS_KEY,
    config=Config(
        signature_version="s3v4",              # <-- required by R2
        s3={"addressing_style": "path"}        # <-- bucket-in-path works best with R2
    ),
)

# list keys so you can pick a real one
resp = s3.list_objects_v2(Bucket=BUCKET)
for o in resp.get("Contents", []):
    print(o["Key"])

# then read one
obj = s3.get_object(Bucket=BUCKET, Key=OBJECT)
print(obj["Body"].read().decode("utf-8"))
