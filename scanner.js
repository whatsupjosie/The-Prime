async function fetchJSON(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    let detail = {};
    try { detail = await resp.json(); } catch {}
    throw new Error(detail.detail || detail.error || String(resp.status));
  }
  return resp.json();
}

const scanFile = document.getElementById('scan-file');
const scanUpload = document.getElementById('scan-upload');
const scanList = document.getElementById('scan-list');
const scanStatus = document.getElementById('scan-status');
const cam = document.getElementById('cam');
const snap = document.getElementById('snap');
const camStart = document.getElementById('cam-start');
const camCapture = document.getElementById('cam-capture');
const photoStatus = document.getElementById('photo-status');
const camRes = document.getElementById('cam-res');
const mirror = document.getElementById('mirror');
const countdownEl = document.getElementById('countdown');
const burstEl = document.getElementById('burst');
const jpegqEl = document.getElementById('jpegq');
const videoDev = document.getElementById('video-dev');
const audioDev = document.getElementById('audio-dev');
const micStart = document.getElementById('mic-start');
const micRecord = document.getElementById('mic-record');
const micTimer = document.getElementById('mic-timer');
const micMeter = document.getElementById('mic-meter');
const autoFace = document.getElementById('auto-face');
const lockAE = document.getElementById('lock-ae');
const guide = document.getElementById('guide');

async function loadScans() {
  try {
    const body = await fetchJSON('/api/avatar/scans');
    const scans = body.scans || [];
    scanList.innerHTML = '';
    scans.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      const name = document.createElement('div');
      name.textContent = s.name + '  (' + Math.round((s.size||0)/1024) + ' KB)';
      const actions = document.createElement('div');
      actions.style.display='flex'; actions.style.gap='6px';
      const view = document.createElement('a'); view.href = s.url; view.textContent = 'Download'; view.className = 'ghost'; view.target='_blank';
      const apply = document.createElement('button'); apply.textContent='Apply as Avatar'; apply.className='ghost';
      apply.addEventListener('click', async ()=>{
        try {
          await fetchJSON('/api/avatar/scan/apply', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: s.url }) });
          scanStatus.textContent = 'Applied scan as avatar.';
        } catch (e) { scanStatus.textContent = 'Error: ' + (e?.message||e); }
      });
      actions.append(view, apply);
      row.append(name, actions);
      scanList.append(row);
    });
  } catch (e) {
    scanList.innerHTML = '<div class="muted">Failed to load scans.</div>';
  }
}

scanUpload?.addEventListener('click', async () => {
  const f = (scanFile?.files || [])[0];
  if (!f) { scanStatus.textContent = 'Choose a file first.'; return; }
  const fd = new FormData(); fd.append('file', f);
  scanStatus.textContent = 'Uploading...';
  try {
    await fetchJSON('/api/avatar/scan', { method:'POST', body: fd });
    scanStatus.textContent = 'Uploaded.';
    await loadScans();
  } catch (e) {
    scanStatus.textContent = 'Error: ' + (e?.message||e);
  }
});

async function enumerateDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter(d => d.kind === 'videoinput');
    const auds = devs.filter(d => d.kind === 'audioinput');
    videoDev.innerHTML=''; audioDev.innerHTML='';
    vids.forEach((d,i)=>{ const opt=document.createElement('option'); opt.value=d.deviceId; opt.textContent=d.label||`Camera ${i+1}`; videoDev.append(opt); });
    auds.forEach((d,i)=>{ const opt=document.createElement('option'); opt.value=d.deviceId; opt.textContent=d.label||`Mic ${i+1}`; audioDev.append(opt); });
  } catch {}
}

function constraintsFromUI() {
  const res = camRes?.value || 'hd';
  const ideal = res==='sd' ? { width:640, height:480 } : (res==='fullhd' ? { width:1920, height:1080 } : (res==='4k' ? { width:3840, height:2160 } : { width:1280, height:720 }));
  const deviceId = videoDev?.value || undefined;
  return { video: deviceId ? { deviceId: { exact: deviceId }, ...ideal } : { facingMode:'user', ...ideal }, audio:false };
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraintsFromUI());
    const tracks = cam.srcObject ? cam.srcObject.getTracks() : [];
    tracks && tracks.forEach(t=>{ try { t.stop(); } catch{} });
    cam.srcObject = stream;
    cam.style.transform = mirror?.checked ? 'scaleX(-1)' : 'none';
    // Try to apply AE/AF locks if requested
    if (lockAE?.checked) {
      try {
        const vtrack = stream.getVideoTracks()[0];
        await vtrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }, { whiteBalanceMode: 'continuous' }, { exposureMode: 'continuous' }] });
      } catch {}
    }
    guide.style.display = autoFace?.checked ? 'block' : 'none';
    photoStatus.textContent = 'Camera started.';
  } catch (e) {
    photoStatus.textContent = 'Camera error: ' + (e?.message||e);
  }
}

camStart?.addEventListener('click', startCamera);
videoDev?.addEventListener('change', startCamera);
camRes?.addEventListener('change', startCamera);
mirror?.addEventListener('change', ()=>{ cam.style.transform = mirror?.checked ? 'scaleX(-1)' : 'none'; });
autoFace?.addEventListener('change', ()=>{ guide.style.display = autoFace?.checked ? 'block' : 'none'; });
if (navigator.mediaDevices?.getUserMedia) enumerateDevices();

camCapture?.addEventListener('click', async () => {
  try {
    if (!cam.srcObject) { photoStatus.textContent = 'Start the camera first.'; return; }
    const doMirror = mirror?.checked;
    const count = Math.max(1, Math.min(5, Number(burstEl?.value || 1)));
    const delay = Math.max(0, Math.min(10, Number(countdownEl?.value || 0)));
    const q = Math.max(0.6, Math.min(1.0, Number(jpegqEl?.value || 92) / 100));
    if (delay > 0) { photoStatus.textContent = `Capturing in ${delay}s...`; await new Promise(r=>setTimeout(r, delay*1000)); }
    const track = cam.srcObject.getVideoTracks()[0];
    let blobs = [];
    if ('ImageCapture' in window && track) {
      try {
        const ic = new ImageCapture(track);
        for (let i=0;i<count;i++) { const b = await ic.takePhoto(); blobs.push(b); }
      } catch { /* fallback to canvas */ }
    }
    if (!blobs.length) {
      const ctx = snap.getContext('2d');
      snap.width = cam.videoWidth || 640; snap.height = cam.videoHeight || 480;
      for (let i=0;i<count;i++) {
        ctx.save();
        if (doMirror) { ctx.translate(snap.width,0); ctx.scale(-1,1); }
        ctx.drawImage(cam, 0, 0, snap.width, snap.height);
        ctx.restore();
        const { cropCanvas } = await faceCropOrCenter(snap, doMirror);
        const blob = await new Promise(res=>cropCanvas.toBlob(res,'image/jpeg', q));
        blobs.push(blob);
      }
    }
    // choose the sharpest frame (fallback to largest)
    let scored = await scoreSharpness(blobs);
    scored.sort((a,b)=> (b.score - a.score) || ((b.blob?.size||0)-(a.blob?.size||0)));
    const fd = new FormData(); fd.append('file', scored[0].blob, 'capture.jpg');
    await fetchJSON('/api/avatar/photo', { method:'POST', body: fd });
    photoStatus.textContent = `Uploaded photo (${Math.round((scored[0].blob?.size||0)/1024)} KB).`;
  } catch (e) {
    photoStatus.textContent = 'Error: ' + (e?.message||e);
  }
});

// Microphone controls
let micStream = null, mediaRecorder = null, audioChunks = [];
micStart?.addEventListener('click', async () => {
  try {
    const deviceId = audioDev?.value || undefined;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false });
    // level meter
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(micStream);
    const analyser = ctx.createAnalyser(); analyser.fftSize=256; src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = ()=>{
      analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s,v)=> s+Math.pow((v-128)/128,2),0)/data.length);
      const canvas = micMeter; const g = canvas.getContext('2d');
      g.clearRect(0,0,canvas.width,canvas.height);
      g.fillStyle = '#2ecc71'; g.fillRect(0,0, Math.min(canvas.width, Math.floor(rms*canvas.width)), canvas.height);
      requestAnimationFrame(draw);
    }; draw();
    photoStatus.textContent = 'Mic ready.';
  } catch (e) { photoStatus.textContent = 'Mic error: ' + (e?.message||e); }
});

micRecord?.addEventListener('click', async () => {
  if (!micStream) { photoStatus.textContent = 'Start the mic first.'; return; }
  try {
    audioChunks = [];
    mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
    let startTs = Date.now(); micTimer.textContent = '00:00';
    const t = setInterval(()=>{ const s = Math.floor((Date.now()-startTs)/1000); const m = String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); micTimer.textContent = m+':'+ss; }, 250);
    mediaRecorder.ondataavailable = (ev)=>{ if (ev.data?.size) audioChunks.push(ev.data); };
    mediaRecorder.onstop = async ()=>{
      clearInterval(t);
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const fd = new FormData(); fd.append('file', blob, 'sample.webm');
      try { await fetchJSON('/api/avatar/voice', { method:'POST', body: fd }); photoStatus.textContent = 'Uploaded voice sample.'; }
      catch(e){ photoStatus.textContent = 'Upload error: '+(e?.message||e); }
    };
    mediaRecorder.start();
    // Record for 5 seconds then stop
    setTimeout(()=>{ try { mediaRecorder.stop(); } catch{} }, 5000);
  } catch (e) { photoStatus.textContent = 'Record error: ' + (e?.message||e); }
});

window.addEventListener('DOMContentLoaded', loadScans);

// --- Helpers: face crop and sharpness scoring ---

async function faceCropOrCenter(canvas, mirrored) {
  const W = canvas.width, H = canvas.height;
  if (autoFace?.checked && 'FaceDetector' in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const bitmap = await createImageBitmap(canvas);
      const faces = await detector.detect(bitmap);
      if (faces && faces.length) {
        const bb = faces[0].boundingBox; // x,y,width,height in canvas space
        // Expand padding around face
        const pad = 0.25;
        let x = Math.max(0, Math.floor(bb.x - bb.width*pad));
        let y = Math.max(0, Math.floor(bb.y - bb.height*pad));
        let w = Math.min(W - x, Math.floor(bb.width*(1+2*pad)));
        let h = Math.min(H - y, Math.floor(bb.height*(1+2*pad)));
        // Make square crop around face center
        const size = Math.min(Math.max(w, h), Math.min(W, H));
        const cx = x + w/2, cy = y + h/2;
        const sx = Math.max(0, Math.min(W - size, Math.floor(cx - size/2)));
        const sy = Math.max(0, Math.min(H - size, Math.floor(cy - size/2)));
        const cropCanvas = document.createElement('canvas'); cropCanvas.width=size; cropCanvas.height=size;
        const g = cropCanvas.getContext('2d');
        g.drawImage(canvas, sx, sy, size, size, 0, 0, size, size);
        return { cropCanvas };
      }
    } catch {}
  }
  // Fallback center square crop
  const size = Math.min(W, H);
  const sx = Math.floor((W - size)/2), sy = Math.floor((H - size)/2);
  const cropCanvas = document.createElement('canvas'); cropCanvas.width=size; cropCanvas.height=size;
  cropCanvas.getContext('2d').drawImage(canvas, sx, sy, size, size, 0, 0, size, size);
  return { cropCanvas };
}

async function scoreSharpness(blobs) {
  const results = [];
  for (const b of blobs) {
    try {
      const bitmap = await createImageBitmap(b);
      const w = 256; const h = Math.floor(bitmap.height * w / bitmap.width);
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      const g = c.getContext('2d');
      g.drawImage(bitmap, 0, 0, w, h);
      const img = g.getImageData(0,0,w,h).data;
      let score = 0;
      // simple gradient magnitude as sharpness: |dx|+|dy|
      const idx = (x,y)=> (y*w + x)*4;
      for (let y=1;y<h-1;y++) {
        for (let x=1;x<w-1;x++) {
          const i = idx(x,y);
          const lum = (img[i]+img[i+1]+img[i+2])/3;
          const lumR = (img[idx(x+1,y)]+img[idx(x+1,y)+1]+img[idx(x+1,y)+2])/3;
          const lumD = (img[idx(x,y+1)]+img[idx(x,y+1)+1]+img[idx(x,y+1)+2])/3;
          score += Math.abs(lum - lumR) + Math.abs(lum - lumD);
        }
      }
      results.push({ blob: b, score });
    } catch { results.push({ blob: b, score: 0 }); }
  }
  return results;
}
