// Billetes de la cartera. Solo visual: el servidor guarda el total y esto decide en qué billetes lo ves.
(function (exports) {
  const DENOMS = [500, 100, 50, 20, 10, 5, 1];
  const START = { 500: 2, 100: 3, 50: 2, 20: 4, 10: 1, 5: 1, 1: 5 }; // $1500 surtidos para empezar
  const total = w => DENOMS.reduce((s, d) => s + d * (w[d] || 0), 0);
  const add = (w, x) => { for (const d of DENOMS) w[d] = (w[d] || 0) + (x[d] || 0); return w; };

  // Desglose con la menor cantidad de billetes, usando solo los menores que `below`.
  function breakdown(amount, below = Infinity) {
    const w = {};
    for (const d of DENOMS) if (d < below) { w[d] = Math.floor(amount / d); amount %= d; }
    return w;
  }

  // Paga con billetes exactos; si no se puede, entrega el billete más chico que cubra lo que falta y recibe cambio.
  function spend(w, amount) {
    for (const d of DENOMS) while (w[d] > 0 && d <= amount) { w[d]--; amount -= d; }
    const big = [...DENOMS].reverse().find(d => w[d] > 0); // tras el bucle, todo billete que quede es mayor que lo que falta
    if (amount > 0 && big) { w[big]--; add(w, breakdown(big - amount)); }
    return w;
  }

  // Ajusta la cartera al dinero real (cobros, pagos; con deuda queda vacía).
  function sync(w, money) {
    const m = Math.max(0, money);
    w = w ? { ...w } : m === total(START) ? { ...START } : breakdown(m);
    const t = total(w);
    return t < m ? add(w, breakdown(m - t)) : t > m ? spend(w, t - m) : w;
  }

  // Billete que se arma juntando billetes de `d` (2×50 → 100, 5×100 → 500), o undefined si no alcanzan.
  const upTarget = (w, d) => [...DENOMS].reverse().find(h => h > d && h % d === 0 && (w[d] || 0) >= h / d);

  // kind: 'up' junta billetes de d, 'down' cambia uno de d por menores, 'tidy' deja la menor cantidad de billetes.
  function exchange(w, kind, d) {
    w = { ...w };
    if (kind === 'tidy') return breakdown(total(w));
    if (kind === 'down' && w[d] > 0 && d > 1) { w[d]--; return add(w, breakdown(d, d)); }
    const h = kind === 'up' && upTarget(w, d);
    if (h) { w[d] -= h / d; w[h] = (w[h] || 0) + 1; }
    return w;
  }

  // Entrega los billetes de `given` para pagar `amount`; el banco devuelve el cambio con la menor cantidad de billetes.
  function payWith(w, given, amount) {
    const out = { ...w };
    for (const d of DENOMS) out[d] = (out[d] || 0) - (given[d] || 0);
    return add(out, breakdown(total(given) - amount));
  }

  Object.assign(exports, { DENOMS, START, total, breakdown, sync, upTarget, exchange, payWith });
})(typeof module === 'object' ? module.exports : (window.Wallet = {}));
