// Red sin servidor propio: el anfitrión corre las reglas (game.js) en su navegador y los invitados se conectan a él
// con PeerJS (WebRTC). El código de la sala es la "dirección" del anfitrión en el servicio público y gratuito de PeerJS.
(function () {
  const PREFIX = 'magnate-sala-', HOST_KEY = 'magnate-host', ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const OPTS = { debug: 0 };
  let peer = null, conn = null, closing = false, reconnecting = false;
  let room = null, sessions = {}, conns = new Set(); // solo el anfitrión
  let guest = null, reqs = {}, rid = 0;               // solo los invitados
  const cb = { state() {}, lost() {}, status() {} };

  const peerId = code => PREFIX + code.toLowerCase();
  const snapshot = () => JSON.parse(JSON.stringify(room));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => ABC[n % ABC.length]).join('');
  const timeout = (promise, ms, value) => Promise.race([promise, sleep(ms).then(() => value)]);

  // ---------- Anfitrión ----------

  function broadcast() {
    room.at = Date.now();
    try { sessionStorage.setItem(HOST_KEY, JSON.stringify({ room, sessions })); } catch {} // para sobrevivir a una recarga
    const snap = snapshot();
    for (const c of conns) if (c.open) c.send({ state: snap });
    cb.state(snap);
  }

  // Lo que llega de los invitados no es de confiar: se valida aquí y game.js valida cada jugada.
  function handle(b) {
    if (!b || typeof b !== 'object') return { error: 'Mensaje inválido' };
    if (b.type === 'join') {
      const name = String(b.name ?? '').trim().slice(0, 16);
      if (!name) return { error: 'Escribe tu nombre' };
      const p = Game.join(room, name);
      if (typeof p === 'string') return { error: p };
      const token = crypto.randomUUID();
      sessions[token] = p.id;
      broadcast();
      return { token, id: p.id, code: room.code };
    }
    const id = Object.hasOwn(sessions, String(b.token)) && sessions[b.token];
    if (!id) return { error: 'Tu sesión expiró, vuelve a entrar' };
    if (b.type === 'resume') return { id };
    const error = Game.act(room, id, b);
    if (error) return { error };
    broadcast();
    return {};
  }

  function listen() {
    peer.on('connection', c => {
      c.on('open', () => conns.add(c));
      c.on('data', m => {
        let out;
        try { out = handle(m); } catch (e) { console.error(e); out = { error: 'Error del anfitrión' }; }
        c.send({ ...out, re: m?.rid });
        if (m?.type === 'resume' && !out.error) c.send({ state: snapshot() });
      });
      c.on('close', () => conns.delete(c));
      c.on('error', () => conns.delete(c));
    });
    peer.on('disconnected', () => { if (!closing) peer.reconnect(); }); // cayó el enlace con PeerJS; los invitados siguen conectados
  }

  // Registra el id de la sala. Si está ocupado (otra sala, o el anfitrión recién recargó y aún no se libera), reintenta.
  function openHost(code, tries) {
    return new Promise(resolve => {
      peer = new Peer(peerId(code), OPTS);
      peer.on('open', () => { listen(); resolve(true); });
      peer.on('error', err => {
        if (err.type !== 'unavailable-id') return cb.status('Problema de conexión: ' + err.type);
        peer.destroy();
        if (tries <= 1) return resolve(false);
        sleep(1500).then(() => openHost(code, tries - 1)).then(resolve);
      });
    });
  }

  async function create(name) {
    for (let k = 0; k < 5; k++) {
      const code = newCode();
      const ok = await timeout(openHost(code, 1), 15000, null);
      if (ok === null) { close(); return { error: 'No se pudo conectar al servicio de salas. Revisa tu internet.' }; }
      if (!ok) continue; // código ocupado: probar otro
      room = Game.newRoom(code);
      sessions = {};
      return { ...handle({ type: 'join', name }), host: true };
    }
    return { error: 'No se pudo crear la sala, intenta de nuevo' };
  }

  // ---------- Invitado ----------

  function connectTo(code) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 15000);
      const done = ok => { clearTimeout(timer); resolve(ok); };
      peer = new Peer(OPTS);
      peer.on('open', () => {
        const c = conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
        c.on('open', () => done(true));
        c.on('data', m => {
          if (m?.state) cb.state(m.state);
          if (m?.re && reqs[m.re]) { reqs[m.re](m); delete reqs[m.re]; }
        });
        c.on('close', () => { if (c === conn && !closing) reconnect(); }); // solo la conexión vigente dispara la reconexión
      });
      peer.on('error', err => { if (err.type === 'peer-unavailable') done(false); else cb.status('Problema de conexión: ' + err.type); });
    });
  }

  function request(body) {
    if (!conn?.open) return Promise.resolve({ error: 'Sin conexión con el anfitrión' });
    return new Promise(resolve => {
      const id = ++rid;
      reqs[id] = resolve;
      conn.send({ ...body, rid: id });
      sleep(10000).then(() => { if (reqs[id]) { delete reqs[id]; resolve({ error: 'El anfitrión no responde' }); } });
    });
  }

  // Se perdió el anfitrión (cerró, recargó o se cortó la red): reintenta un rato antes de rendirse.
  async function reconnect() {
    if (reconnecting || !guest) return;
    reconnecting = true;
    cb.status('Reconectando con el anfitrión…');
    for (let k = 0; k < 12 && !closing; k++) {
      conn = null;
      peer?.destroy();
      if (await connectTo(guest.code) && !(await request({ type: 'resume', token: guest.token })).error) {
        reconnecting = false;
        return cb.status('');
      }
      await sleep(2000);
    }
    reconnecting = false;
    if (!closing) cb.lost();
  }

  function close() {
    closing = true;
    conn = null;
    peer?.destroy();
    peer = room = guest = null;
    conns.clear();
    try { sessionStorage.removeItem(HOST_KEY); } catch {}
    closing = false;
  }

  window.Net = {
    on(handlers) { Object.assign(cb, handlers); },
    create,
    async join(code, name) {
      code = String(code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) return { error: 'El código son 4 letras o números' };
      if (!(await connectTo(code))) {
        close();
        return { error: 'No encontré esa sala. Revisa el código: el anfitrión debe tener la partida abierta.' };
      }
      const out = await request({ type: 'join', name });
      if (out.error) close();
      else guest = { code, token: out.token };
      return { ...out, code };
    },
    send: body => (room ? Promise.resolve(handle(body)) : request(body)),
    // Al recargar la página: el anfitrión recupera su sala guardada; el invitado vuelve a conectarse.
    async resume(saved) {
      if (!saved.code) return false;
      if (!saved.host) {
        guest = { code: saved.code, token: saved.token };
        reconnect();
        return true;
      }
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem(HOST_KEY)); } catch {}
      if (s?.room?.code !== saved.code) return false;
      ({ room, sessions } = s);
      if (!(await timeout(openHost(saved.code, 10), 30000, false))) { room = null; return false; }
      cb.state(snapshot());
      return true;
    },
    close,
  };
})();
