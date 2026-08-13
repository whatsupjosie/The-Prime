
// Simple WebSocket wrapper with room handling, auto-reconnect, and ping
(function () {
  function WSHub(room, onEvent) {
    this.room = room;
    this.onEvent = onEvent || function () {};
    this.ws = null;
    this._timer = null;
    this._backoff = 500; // ms, grows up to 5s
  }
  WSHub.prototype.connect = function () {
    try { if (this.ws) this.ws.close(); } catch {}
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/${encodeURIComponent(this.room)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this._backoff = 500;
      this._startPing();
      try { if (typeof window.__pub_ws_status === 'function') window.__pub_ws_status('open'); } catch {}
    };
    ws.onmessage = (ev) => {
      try { this.onEvent(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    };
    ws.onclose = () => {
      this._stopPing();
      try { if (typeof window.__pub_ws_status === 'function') window.__pub_ws_status('closed'); } catch {}
      // reconnect with backoff
      const wait = this._backoff;
      this._backoff = Math.min(this._backoff * 2, 5000);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {
      try { if (typeof window.__pub_ws_status === 'function') window.__pub_ws_status('error'); } catch {}
      try { ws.close(); } catch {}
    };
  };
  WSHub.prototype._startPing = function () {
    this._stopPing();
    this._timer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
        }
      } catch {}
    }, 3000);
  };
  WSHub.prototype._stopPing = function () {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  };
  WSHub.prototype.send = function (obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  };
  WSHub.prototype.changeRoom = function (room) {
    this.room = room;
    this.connect();
  };
  // expose globally
  window.WSHub = WSHub;
})();
