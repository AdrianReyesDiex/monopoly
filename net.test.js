// Prueba net.js con un PeerJS de mentira en memoria: cada "navegador" corre net.js en su propio contexto aislado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const Game = require('./game');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const later = fn => setTimeout(fn, 1);
const peers = new Map();

class Emitter {
  h = {};
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
}
class FakeConn extends Emitter {
  open = false;
  send(m) { const o = this.other, data = JSON.parse(JSON.stringify(m)); later(() => o.open && o.emit('data', data)); }
  close() { for (const c of [this, this.other]) if (c.open) { c.open = false; later(() => c.emit('close')); } }
}
class FakePeer extends Emitter {
  conns = [];
  constructor(id) {
    super();
    this.id = typeof id === 'string' ? id : 'invitado-' + Math.random();
    later(() => {
      if (peers.has(this.id)) return this.emit('error', { type: 'unavailable-id' });
      peers.set(this.id, this);
      this.emit('open');
    });
  }
  connect(id) {
    const a = new FakeConn(), b = new FakeConn();
    a.other = b; b.other = a;
    this.conns.push(a);
    later(() => {
      const target = peers.get(id);
      if (!target) return this.emit('error', { type: 'peer-unavailable' });
      target.conns.push(b);
      target.emit('connection', b);
      later(() => { a.open = b.open = true; a.emit('open'); b.emit('open'); });
    });
    return a;
  }
  destroy() { if (peers.get(this.id) === this) peers.delete(this.id); this.conns.forEach(c => c.close()); }
  reconnect() {}
}

function browser(stored = {}) {
  const store = new Map(Object.entries(stored));
  const ctx = {
    Peer: FakePeer, Game, crypto, setTimeout, clearTimeout, console,
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(__dirname + '/net.js', 'utf8'), ctx);
  const states = [];
  ctx.Net.on({ state: s => states.push(s), lost: () => { ctx.lost = true; }, status() {} });
  return { Net: ctx.Net, states, ctx, store };
}

test('anfitrión y amigo juegan por la red', async () => {
  const host = browser(), friend = browser();
  const h = await host.Net.create('Ana');
  assert.ok(h.token && h.host && /^[A-Z0-9]{4}$/.test(h.code), JSON.stringify(h));
  assert.match((await friend.Net.join('ZZZZ', 'Beto')).error, /No encontré/);
  assert.match((await friend.Net.join('abc', 'Beto')).error, /4 letras/);
  const f = await friend.Net.join(h.code.toLowerCase(), 'Beto');
  assert.ok(f.token, f.error);
  assert.match((await friend.Net.send({ type: 'start', token: f.token })).error, /anfitrión/); // validado por game.js
  assert.match((await friend.Net.send({ type: 'start', token: 'falso' })).error, /sesión/);
  assert.equal((await friend.Net.send({ type: 'pick', token: f.token, i: 4 })).error, undefined);
  assert.equal((await host.Net.send({ type: 'start', token: h.token })).error, undefined);
  await sleep(10);
  const seen = friend.states.at(-1);
  assert.ok(seen.started);
  assert.equal(seen.players[1].char, 4);
  host.Net.close();
  friend.Net.close();
});

test('si el anfitrión recarga, recupera la sala y el amigo se reconecta solo', async () => {
  const host = browser(), friend = browser();
  const h = await host.Net.create('Ana');
  const f = await friend.Net.join(h.code, 'Beto');
  const saved = host.store.get('magnate-host');
  host.Net.close(); // la pestaña se recarga: se pierde la conexión...
  const host2 = browser({ 'magnate-host': saved }); // ...y vuelve con lo guardado
  assert.ok(await host2.Net.resume({ ...h, host: true }));
  await sleep(2500); // el amigo reintenta cada 2 s
  assert.equal(friend.ctx.lost, undefined);
  assert.equal((await friend.Net.send({ type: 'pick', token: f.token, i: 6 })).error, undefined);
  assert.equal(host2.states.at(-1).players[1].char, 6);
  host2.Net.close();
  friend.Net.close();
});
