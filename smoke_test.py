import os, json, time
from pathlib import Path
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)

results = {}

# Basic pages
for path in ['/', '/dressing', '/admin', '/map', '/control', '/gallery', '/analytics']:
    r = client.get(path)
    results[path] = r.status_code

# Avatar endpoints
client.get('/')
r = client.get('/api/avatars/presets')
results['/api/avatars/presets'] = (r.status_code, isinstance(r.json().get('presets'), list))

save = client.post('/api/avatar/me', json={
    'display_name':'Smoke Tester', 'primary_color':'#112233', 'badge':'TEST'
})
results['/api/avatar/me POST'] = save.status_code

me = client.get('/api/avatar/me')
results['/api/avatar/me GET name'] = me.json().get('display_name')

# WebSocket chat flow
with client.websocket_connect('/ws/control') as ws:
    # Receive initial history or presence messages (non-deterministic)
    ws.send_text(json.dumps({'type':'typing'}))
    ws.send_text(json.dumps({'type':'chat','payload':{'text':'hello from smoke'}}))
    got_chat = False
    got_presence = False
    got_pong = False
    ws.send_text(json.dumps({'type':'ping','payload':{'t':123}}))
    t0 = time.time()
    while time.time() - t0 < 3.0:
        data = json.loads(ws.receive_text())
        if data.get('type') == 'chat' and data.get('payload',{}).get('text') == 'hello from smoke':
            got_chat = True
        if data.get('type') == 'presence':
            got_presence = True
        if data.get('type') == 'pong':
            got_pong = True
        if got_chat and got_presence and got_pong:
            break
    results['ws.chat'] = got_chat
    results['ws.presence'] = got_presence
    results['ws.pong'] = got_pong

# Bot APIs (upsert minimal openai bot using a dummy env var; we expect not to call provider yet)
os.environ['DUMMY_OPENAI_KEY'] = 'x'
body = {
  'agent_id':'cricket',
  'display_name':'Cricket',
  'provider':'openai',
  'model':'gpt-test',
  'key_env':'DUMMY_OPENAI_KEY',
  'rooms':['control'],
}
up = client.post('/api/bots', json=body)
results['/api/bots POST'] = up.status_code
lb = client.get('/api/bots')
results['/api/bots GET count'] = len(lb.json().get('bots', []))
bs = client.post('/api/bots/say', json={'room':'control','bot_id':'cricket','text':'Hi from bot'})
results['/api/bots/say'] = bs.status_code

# Video token (expected 503 if not configured)
vt = client.post('/api/video/token', json={'room':'conference'})
results['/api/video/token'] = vt.status_code

# TTS endpoint
# Expect 503 with default browser provider
try:
    tts = client.post('/api/tts', json={'text':'hello world'})
    results['/api/tts default'] = tts.status_code
except Exception as e:
    results['/api/tts default'] = str(e)

print(json.dumps(results, indent=2))
