const test = require('node:test');
const assert = require('node:assert');
const Game = require('./game');

// Fuerza las caras de los próximos dados.
const dice = (...faces) => { let k = 0; Math.random = () => (faces[k++] - 1) / 6 + 0.01; };

function setup() {
  const room = Game.newRoom('TEST');
  const a = Game.join(room, 'Ana'), b = Game.join(room, 'Beto');
  assert.equal(Game.act(room, a.id, { type: 'start' }), undefined);
  return { room, a, b };
}

test('tablero de 40 casillas con esquinas en su lugar', () => {
  assert.equal(Game.BOARD.length, 40);
  assert.deepEqual([0, 10, 20, 30].map(i => Game.BOARD[i].type), ['start', 'jail', 'rest', 'gojail']);
});

test('comprar y cobrar renta', () => {
  const { room, a, b } = setup();
  assert.equal(Game.act(room, b.id, { type: 'roll' }), 'No es tu turno');
  dice(1, 3);
  Game.act(room, a.id, { type: 'roll' }); // cae en Terminal de Buses (4)
  assert.equal(Game.act(room, a.id, { type: 'buy' }), undefined);
  assert.equal(Game.act(room, a.id, { type: 'end' }), undefined);
  dice(1, 3);
  Game.act(room, b.id, { type: 'roll' });
  assert.deepEqual(room.dues, [{ to: a.id, amount: 25, why: 'renta' }]); // la renta queda pendiente hasta que Beto la pague
  assert.match(Game.act(room, b.id, { type: 'end' }), /Primero paga/);
  assert.match(Game.act(room, b.id, { type: 'buy' }), /Primero paga/);
  assert.equal(Game.act(room, b.id, { type: 'pay' }), undefined);
  assert.deepEqual([a.money, b.money], [1500 - 200 + 25, 1500 - 25]);
  assert.match(Game.act(room, b.id, { type: 'buy' }), /No puedes comprar/);
});

test('si no alcanza para la deuda, quiebra y el acreedor se queda lo que había', () => {
  const { room, a, b } = setup();
  room.owned[4] = { owner: a.id, houses: 0, mortgaged: false };
  room.turn = 1;
  b.money = 10;
  dice(1, 3);
  Game.act(room, b.id, { type: 'roll' }); // renta de $25 con solo $10
  assert.match(Game.act(room, b.id, { type: 'pay' }), /No te alcanza/);
  assert.equal(Game.act(room, b.id, { type: 'end' }), undefined);
  assert.ok(b.out);
  assert.equal(a.money, 1510);
  assert.equal(room.winner, a.id);
});

test('tres dobles seguidos mandan a la cárcel', () => {
  const { room, a } = setup();
  dice(1, 1, 2, 2, 3, 3);
  Game.act(room, a.id, { type: 'roll' });
  Game.act(room, a.id, { type: 'roll' }); // cae en Impuesto: hay que pagarlo antes de volver a tirar
  assert.match(Game.act(room, a.id, { type: 'roll' }), /Primero paga/);
  Game.act(room, a.id, { type: 'pay' });
  Game.act(room, a.id, { type: 'roll' });
  assert.equal(a.pos, 10);
  assert.ok(a.jailed);
  assert.equal(room.canRoll, false);
});

test('construir exige el grupo completo y parejo', () => {
  const { room, a } = setup();
  room.owned[1] = { owner: a.id, houses: 0, mortgaged: false };
  assert.match(Game.act(room, a.id, { type: 'build', i: 1 }), /todo el grupo/);
  room.owned[2] = { owner: a.id, houses: 0, mortgaged: false };
  assert.equal(Game.act(room, a.id, { type: 'build', i: 1 }), undefined);
  assert.match(Game.act(room, a.id, { type: 'build', i: 1 }), /parejo/);
  assert.equal(Game.act(room, a.id, { type: 'build', i: 2 }), undefined);
  assert.match(Game.act(room, a.id, { type: 'mortgage', i: 2 }), /vende las casas/);
  assert.equal(Game.rent(room, 1), 6 * 5);
  assert.match(Game.act(room, a.id, { type: 'build', i: 5 }), /no es tuya/);
});

test('quebrar libera propiedades y deja un ganador', () => {
  const { room, a, b } = setup();
  room.owned[1] = { owner: b.id, houses: 0, mortgaged: false };
  room.turn = 1;
  b.money = -10;
  assert.match(Game.act(room, b.id, { type: 'roll' }), /deudas/);
  assert.equal(Game.act(room, b.id, { type: 'end' }), undefined);
  assert.ok(b.out);
  assert.equal(room.owned[1], undefined);
  assert.equal(room.winner, a.id);
});

test('elegir personaje: únicos y solo antes de empezar', () => {
  const room = Game.newRoom('PJ');
  const a = Game.join(room, 'Ana'), b = Game.join(room, 'Beto');
  assert.notEqual(a.char, b.char);
  assert.match(Game.act(room, b.id, { type: 'pick', i: a.char }), /ya lo eligió/);
  assert.match(Game.act(room, b.id, { type: 'pick', i: 99 }), /inválido/);
  assert.equal(Game.act(room, b.id, { type: 'pick', i: 5 }), undefined);
  assert.deepEqual([b.char, b.color], [5, Game.CHARACTERS[5].color]);
  Game.act(room, a.id, { type: 'start' });
  assert.match(Game.act(room, b.id, { type: 'pick', i: 6 }), /ya empezó/);
});
