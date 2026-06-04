FROM python:3.11-slim

WORKDIR /app

# Dipendenze di sistema per OpenCV e ultralytics
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-scarica il modello YOLOv8n durante il build
# così il cold start non deve scaricarlo al runtime
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY app/ ./app/
COPY main.py .

ENV PORT=8080
EXPOSE 8080

CMD ["python", "main.py"]
