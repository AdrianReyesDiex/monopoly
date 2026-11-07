const test = require('node:test');
const assert = require('node:assert');
const W = require('./wallet');

const valid = (w, money) => {
  assert.equal(W.total(w), Math.max(0, money));
  assert.ok(W.DENOMS.every(d => (w[d] || 0) >= 0), JSON.stringify(w));
};

test('empieza con $1500 surtidos', () => {
  assert.deepEqual(W.sync(null, 1500), W.START);
});

test('cobrar y pagar (con cambio) siempre cuadra con el dinero real', () => {
  let w = W.sync(null, 1500), money = 1500;
  for (let k = 0; k < 2000; k++) {
    money = Math.max(-200, money + Math.floor(Math.random() * 801) - 420);
    w = W.sync(w, money);
    valid(w, money);
  }
  assert.deepEqual(W.sync({ 500: 1 }, 425), { 500: 0, 100: 4, 50: 0, 20: 1, 10: 0, 5: 1, 1: 0 }); // paga 75 con uno de 500
});

test('pagar con billetes elegidos y recibir cambio', () => {
  const w = W.payWith({ 500: 1, 100: 2 }, { 500: 1 }, 25); // paga $25 con uno de $500
  valid(w, 675);
  assert.deepEqual([w[500], w[100], w[50], w[20], w[5]], [0, 6, 1, 1, 1]);
  assert.deepEqual(W.payWith({ 20: 1, 5: 1 }, { 20: 1, 5: 1 }, 25)[20], 0); // exacto: sin cambio
});

test('juntar y cambiar billetes', () => {
  assert.deepEqual(W.exchange({ 100: 5 }, 'up', 100), { 100: 0, 500: 1 });
  assert.deepEqual(W.exchange({ 100: 4 }, 'up', 100), { 100: 4 }); // no alcanzan
  assert.equal(W.upTarget({ 50: 2 }, 50), 100);
  const down = W.exchange({ 500: 1 }, 'down', 500);
  assert.equal(down[500], 0);
  assert.equal(down[100], 5);
  const fifty = W.exchange({ 50: 1 }, 'down', 50);
  assert.deepEqual([fifty[20], fifty[10]], [2, 1]);
  assert.deepEqual(W.exchange({ 1: 3 }, 'down', 1), { 1: 3 }); // el de $1 no se cambia
  const tidy = W.exchange({ 100: 5, 20: 5, 1: 7 }, 'tidy');
  assert.deepEqual([tidy[500], tidy[100], tidy[5], tidy[1]], [1, 1, 1, 2]);
});
