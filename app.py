import os
import sys
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LAYOUT_FILE_PATH = os.path.join(BASE_DIR, "polygonal_layout_state.json")

# Ensure editor_core is in python path
editor_core_path = os.path.join(BASE_DIR, "editor_core")
if editor_core_path not in sys.path:
    sys.path.insert(0, editor_core_path)

from editor_core.engine import PubCastEditorEngine
from editor_core.editor_router import EditorRouter
from editor_core.craft_coaching import CraftCoachingEngine, FormatTransformer

app = FastAPI(title="PubCast Unified Platform V10")

# Initialize Editor Engines
editor_engine = PubCastEditorEngine()
editor_router = EditorRouter()
craft_engine = CraftCoachingEngine()

# Data models
class TrayState(BaseModel):
    id: str
    title: str
    vertices: List[Dict[str, float]]
    module_type: str
    status: str = "ACTIVE"

class LayoutPayload(BaseModel):
    trays: List[TrayState]

class TextCheckRequest(BaseModel):
    text: str
    sacred_ranges: Optional[List[List[int]]] = None

class CommandRequest(BaseModel):
    query: str

class TransformRequest(BaseModel):
    text: str
    target_format: str

# ------------------------------------------------------------------
# UNIFIED SINGLE-PAGE APPLICATION UI
# ------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def get_unified_ui():
    control_room_html = ""
    control_room_path = os.path.join(BASE_DIR, "control_room_ui.html")
    if os.path.exists(control_room_path):
        with open(control_room_path, "r", encoding="utf-8") as f:
            control_room_html = f.read()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PubCast V10 Unified Suite</title>
    <style>
        body {{
            margin: 0;
            padding: 0;
            background-color: #0b0c10;
            color: #c5c6c7;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }}
        #top-navigation-bar {{
            height: 48px;
            background: #1f2833;
            border-bottom: 2px solid #66fcf1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-sizing: border-box;
            z-index: 9999;
        }}
        .brand-title {{
            font-size: 18px;
            font-weight: bold;
            color: #66fcf1;
            letter-spacing: 1.5px;
            text-transform: uppercase;
        }}
        .nav-tabs {{
            display: flex;
            gap: 12px;
        }}
        .nav-btn {{
            background: #0b0c10;
            color: #c5c6c7;
            border: 1px solid #45a29e;
            padding: 6px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
        }}
        .nav-btn.active, .nav-btn:hover {{
            background: #66fcf1;
            color: #0b0c10;
            box-shadow: 0 0 10px rgba(102, 252, 241, 0.5);
        }}
        .view-panel {{
            display: none;
            flex: 1;
            position: relative;
            overflow: hidden;
        }}
        .view-panel.active {{
            display: flex;
        }}

        /* Word Processor Custom Styles */
        .wp-container {{
            width: 100%;
            height: 100%;
            padding: 20px;
            box-sizing: border-box;
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            background: #0f111a;
            overflow-y: auto;
        }}
        .wp-box {{
            background: #181b28;
            border: 1px solid #2e334a;
            border-radius: 10px;
            padding: 16px;
            display: flex;
            flex-direction: column;
        }}
        .wp-textarea {{
            width: 100%;
            flex: 1;
            min-height: 350px;
            background: #0c0d14;
            border: 1px solid #333852;
            color: #f5f6ff;
            padding: 12px;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            resize: vertical;
            box-sizing: border-box;
        }}
        .wp-toolbar {{
            display: flex;
            gap: 10px;
            margin-top: 12px;
            flex-wrap: wrap;
        }}
        .wp-btn {{
            background: linear-gradient(135deg, #c07a2b, #8a4a12);
            color: white;
            border: 1px solid #e09b45;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
        }}
        .wp-btn.secondary {{
            background: #232738;
            border-color: #414763;
            color: #c4caed;
        }}
        .wp-sidebar {{
            display: flex;
            flex-direction: column;
            gap: 16px;
        }}
        .wp-card {{
            background: #181b28;
            border: 1px solid #2e334a;
            border-radius: 10px;
            padding: 14px;
        }}
        .wp-card h3 {{
            margin-top: 0;
            color: #6dd6c7;
            font-size: 16px;
            border-bottom: 1px solid #2d3248;
            padding-bottom: 6px;
        }}
        .wp-res-box {{
            background: #0c0d14;
            border: 1px solid #282c3f;
            padding: 10px;
            border-radius: 6px;
            font-size: 13px;
            max-height: 140px;
            overflow-y: auto;
            white-space: pre-wrap;
        }}
        .ann-item {{
            background: #10121d;
            border-left: 4px solid #c07a2b;
            padding: 8px;
            margin-bottom: 6px;
            border-radius: 0 4px 4px 0;
            font-size: 13px;
        }}
        .ann-item.error {{ border-left-color: #e74c3c; }}
        .ann-item.warning {{ border-left-color: #f39c12; }}
        .ann-item.info {{ border-left-color: #3498db; }}
    </style>
</head>
<body>
    <div id="top-navigation-bar">
        <div class="brand-title">PUBCAST V10 UNIFIED PLATFORM SUITE</div>
        <div class="nav-tabs">
            <button class="nav-btn active" onclick="switchTab('control-room')">POLYGONAL CONTROL ROOM</button>
            <button class="nav-btn" onclick="switchTab('word-processor')">WORD PROCESSOR & EDITING ENGINE</button>
        </div>
    </div>

    <!-- CONTROL ROOM PANEL -->
    <div id="panel-control-room" class="view-panel active" style="width:100%; height:calc(100vh - 48px);">
        <iframe id="cr-frame" style="width:100%; height:100%; border:none;" srcdoc="{control_room_html.replace('"', '&quot;')}"></iframe>
    </div>

    <!-- WORD PROCESSOR PANEL -->
    <div id="panel-word-processor" class="view-panel">
        <div class="wp-container">
            <div class="wp-box">
                <div style="margin-bottom:8px; font-weight:bold; color:#a2a8d3;">Manuscript & Prose Editor</div>
                <textarea id="editorText" class="wp-textarea" placeholder="Type or paste your story here...">The quick brown fox jumps over the lazy dog. King Arthur held his sword tight and proclaimed victory.

JOHN
I am standing here in the rain.

MARY
Then come inside.</textarea>
                <div class="wp-toolbar">
                    <button class="wp-btn" onclick="checkManuscript()">Check Manuscript</button>
                    <button class="wp-btn secondary" onclick="transformFormat('screenplay')">Format -> Screenplay</button>
                    <button class="wp-btn secondary" onclick="transformFormat('stage_play')">Format -> Stage Play</button>
                    <button class="wp-btn secondary" onclick="getAnalytics()">Style Analytics</button>
                </div>
                <div style="margin-top:16px;">
                    <div style="font-weight:bold; color:#a2a8d3; margin-bottom:6px;">Transformed / Processed Output</div>
                    <div class="wp-res-box" id="outputBox">Ready for editing.</div>
                </div>
            </div>
            <div class="wp-sidebar">
                <div class="wp-card">
                    <h3>Real-time Critique & Annotations</h3>
                    <div id="annotationsList">
                        <div class="ann-item info">Click 'Check Manuscript' to scan spelling, grammar, continuity, and craft.</div>
                    </div>
                </div>
                <div class="wp-card">
                    <h3>On-Demand Editor Assistant</h3>
                    <input type="text" id="routerQuery" style="width:100%; background:#0c0d14; border:1px solid #333852; color:#fff; padding:8px; border-radius:6px; box-sizing:border-box; margin-bottom:8px;" placeholder="e.g., synonym for victory / rhyme with tight">
                    <button class="wp-btn" onclick="runQuery()" style="width:100%;">Query Assistant</button>
                    <div class="wp-res-box" id="routerResult" style="margin-top:8px;">Awaiting query...</div>
                </div>
                <div class="wp-card">
                    <h3>Author Primacy & Buffer Lock</h3>
                    <div style="font-size:12px; color:#8e94be;">Pre-finalize edits re-trigger full downstream AI context evaluation & fact re-extraction. Finalized buffer zones are protected.</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function switchTab(tabName) {{
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
            
            if (tabName === 'control-room') {{
                document.querySelectorAll('.nav-btn')[0].classList.add('active');
                document.getElementById('panel-control-room').classList.add('active');
            }} else {{
                document.querySelectorAll('.nav-btn')[1].classList.add('active');
                document.getElementById('panel-word-processor').classList.add('active');
            }}
        }}

        async function checkManuscript() {{
            const text = document.getElementById('editorText').value;
            const res = await fetch('/api/check', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{text: text}})
            }});
            const data = await res.json();
            const list = document.getElementById('annotationsList');
            list.innerHTML = '';
            if (!data.annotations || data.annotations.length === 0) {{
                list.innerHTML = "<div class='ann-item info'>No issues found. Perfect prose!</div>";
            }} else {{
                data.annotations.forEach(a => {{
                    const div = document.createElement('div');
                    let sevClass = a.severity === 'ERROR' ? 'error' : (a.severity === 'WARNING' ? 'warning' : 'info');
                    div.className = `ann-item ${{sevClass}}`;
                    div.innerHTML = `<strong>[${{a.kind}}]</strong> ${{a.message}}`;
                    list.appendChild(div);
                }});
            }}
        }}

        async function runQuery() {{
            const q = document.getElementById('routerQuery').value;
            const res = await fetch('/api/query', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{query: q}})
            }});
            const data = await res.json();
            document.getElementById('routerResult').textContent = JSON.stringify(data.results || data, null, 2);
        }}

        async function transformFormat(target) {{
            const text = document.getElementById('editorText').value;
            const res = await fetch('/api/transform', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{text: text, target_format: target}})
            }});
            const data = await res.json();
            document.getElementById('outputBox').textContent = data.result;
        }}

        async function getAnalytics() {{
            const text = document.getElementById('editorText').value;
            const res = await fetch('/api/check', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{text: text}})
            }});
            const data = await res.json();
            document.getElementById('outputBox').textContent = `Total Annotations: ${{data.annotations.length}}\\nScanned Character Count: ${{text.length}}`;
        }}
    </script>
</body>
</html>"""

# ------------------------------------------------------------------
# CONTROL ROOM API ENDPOINTS
# ------------------------------------------------------------------
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

# ------------------------------------------------------------------
# EDITOR CORE API ENDPOINTS
# ------------------------------------------------------------------
@app.post("/api/check")
def check_text(req: TextCheckRequest):
    sacred = [tuple(r) for r in req.sacred_ranges] if req.sacred_ranges else None
    anns = editor_engine.check_manuscript(req.text, sacred_ranges=sacred)
    return {
        "annotations": [
            {
                "kind": a.kind.name,
                "severity": a.severity.name,
                "message": a.message,
                "start": a.start,
                "end": a.end
            }
            for a in anns
        ]
    }

@app.post("/api/query")
def query_router(req: CommandRequest):
    return editor_router.route_command(req.query)

@app.post("/api/transform")
def transform_text(req: TransformRequest):
    lines = [l.strip() for l in req.text.split('\n') if l.strip()]
    char = lines[0] if lines else "AUTHOR"
    dialogue = " ".join(lines[1:]) if len(lines) > 1 else req.text
    if req.target_format.lower() == "screenplay":
        res = FormatTransformer.prose_to_screenplay(character=char, dialogue=dialogue)
    else:
        res = FormatTransformer.prose_to_stage_play(character=char, dialogue=dialogue)
    return {"result": res}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")
