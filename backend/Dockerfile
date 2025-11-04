# ---- Python base image ----
FROM python:3.10-slim

# ---- Set work directory ----
WORKDIR /app

# ---- Install system deps ----
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ---- Copy project ----
COPY . .

# ---- Install Python deps ----
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# ---- Expose server port ----
EXPOSE 8080

# ---- Start app ----
CMD ["uvicorn", "classes:app", "--host", "0.0.0.0", "--port", "8080"]
