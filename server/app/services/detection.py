import os
from io import BytesIO
from typing import Optional, TypedDict

from PIL import Image
from ultralytics import YOLO

_model: Optional[YOLO] = None
_PERSON_CLASS = 0


class Box(TypedDict):
    x1: float  # normalizzato [0,1]
    y1: float
    x2: float
    y2: float
    confidence: float


class DetectionResult(TypedDict):
    count: int
    boxes: list[Box]
    width: int
    height: int


def init_model():
    global _model
    model_path = os.environ.get("YOLO_MODEL_PATH", "yolov8n.pt")
    _model = YOLO(model_path)
    print(f"[detection] Modello YOLOv8 caricato: {model_path}")


def detect_people(image_bytes: bytes) -> DetectionResult:
    if _model is None:
        raise RuntimeError("Modello non inizializzato. Chiamare init_model() prima.")

    confidence = float(os.environ.get("YOLO_CONFIDENCE", "0.4"))
    imgsz = int(os.environ.get("YOLO_IMGSZ", "416"))

    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    width, height = image.size

    results = _model.predict(
        source=image,
        conf=confidence,
        imgsz=imgsz,
        classes=[_PERSON_CLASS],
        verbose=False,
    )

    boxes_out: list[Box] = []
    count = 0

    if results and len(results) > 0:
        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            for i in range(len(boxes)):
                cls = int(boxes.cls[i].item())
                if cls != _PERSON_CLASS:
                    continue
                xyxy = boxes.xyxy[i].tolist()  # [x1, y1, x2, y2] in pixel
                conf = float(boxes.conf[i].item())
                boxes_out.append({
                    "x1": round(xyxy[0] / width, 4),
                    "y1": round(xyxy[1] / height, 4),
                    "x2": round(xyxy[2] / width, 4),
                    "y2": round(xyxy[3] / height, 4),
                    "confidence": round(conf, 3),
                })
                count += 1

    return {
        "count": count,
        "boxes": boxes_out,
        "width": width,
        "height": height,
    }
