import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LAYOUT_FILE_PATH = os.path.join(BASE_DIR, "polygonal_layout_state.json")

app = FastAPI(title="PubCast Polygonal Control Room State Server")

class TrayState(BaseModel):
    id: str
    title: str
    vertices: List[Dict[str, float]]
    module_type: str
    status: str = "ACTIVE"

class LayoutPayload(BaseModel):
    trays: List[TrayState]

@app.get("/", response_class=HTMLResponse)
def get_control_room_ui():
    html_path = os.path.join(BASE_DIR, "control_room_ui.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>PubCast Control Room UI file not found</h1>"

@app.get("/api/layout")
def get_layout():
    if os.path.exists(LAYOUT_FILE_PATH):
        try:
            with open(LAYOUT_FILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read layout: {str(e)}")
    return {"trays": []}

@app.post("/api/layout")
def save_layout(payload: LayoutPayload):
    try:
        data = {"trays": [t.dict() for t in payload.trays]}
        with open(LAYOUT_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return {"status": "success", "saved_trays_count": len(payload.trays)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save layout: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")
