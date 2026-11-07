// Reglas de Magnate. El servidor las ejecuta (es la autoridad); el navegador solo las usa para dibujar.
(function (exports) {
  const P = (name, group, price) => ({ type: 'prop', name, group, price });
  const T = (name, icon) => ({ type: 'transport', name, icon, price: 200 });
  const U = (name, icon) => ({ type: 'util', name, icon, price: 150 });
  const CARD = { type: 'card', name: 'Sorpresa', icon: 'Gift', desc: 'Toma una carta sorpresa' };

  const BOARD = [
    { type: 'start', name: 'Salida', icon: 'Flag', desc: 'Cobra $200 cada vez que pasas' },
    P('Callejón Gris', 'A', 60), P('Pasaje Lunar', 'A', 70), CARD, T('Terminal de Buses', 'Bus'),
    P('Calle Naranjo', 'B', 100), { type: 'tax', name: 'Impuesto', icon: 'Receipt', amount: 100 },
    P('Av. Los Pinos', 'B', 100), P('Plaza Chica', 'B', 120), CARD,
    { type: 'jail', name: 'Cárcel', icon: 'Lock', desc: 'De visita… o encerrado' },
    P('Mercado Central', 'C', 140), P('Barrio Alto', 'C', 140), U('Planta Solar', 'Sun'),
    P('Calle Real', 'C', 160), T('Estación de Tren', 'TrainFront'), CARD,
    P('Av. del Río', 'D', 180), P('Paseo Verde', 'D', 180), P('Plaza Mayor', 'D', 200),
    { type: 'rest', name: 'Descanso', icon: 'Coffee', desc: 'Aquí no pasa nada' },
    P('Malecón', 'E', 220), CARD, P('Bahía Sol', 'E', 220), P('Mirador', 'E', 240), T('Puerto', 'Ship'),
    P('Distrito Arte', 'F', 260), U('Acueducto', 'Droplet'), P('Av. Libertad', 'F', 260), P('Parque Norte', 'F', 280),
    { type: 'gojail', name: '¡A la cárcel!', icon: 'Siren', desc: 'Vas directo a la cárcel' },
    P('Torre Norte', 'G', 300), CARD, P('Zona Financiera', 'G', 300), P('Bulevar Central', 'G', 320),
    T('Aeropuerto', 'Plane'), { type: 'tax', name: 'Impuesto de lujo', icon: 'Gem', amount: 150 },
    P('Colina Real', 'H', 350), CARD, P('Isla Dorada', 'H', 400),
  ];
  const COLORS = { A: '#26a69a', B: '#9ccc65', C: '#ff8a65', D: '#4dd0e1', E: '#ba68c8', F: '#ffd54f', G: '#f06292', H: '#3949ab' };
  // Personajes para elegir en la sala; el color del personaje es el del jugador. icon = nombre de icono Lucide.
  const CHARACTERS = [
    { name: 'Cohete', icon: 'Rocket', color: '#e53935' }, { name: 'Robot', icon: 'Bot', color: '#1e88e5' },
    { name: 'Tortuga', icon: 'Turtle', color: '#43a047' }, { name: 'Corona', icon: 'Crown', color: '#f9a825' },
    { name: 'Guitarra', icon: 'Guitar', color: '#8e24aa' }, { name: 'Pizza', icon: 'Pizza', color: '#fb8c00' },
    { name: 'Conejo', icon: 'Rabbit', color: '#ec407a' }, { name: 'Fantasma', icon: 'Ghost', color: '#607d8b' },
    { name: 'Bici', icon: 'Bike', color: '#00897b' },
  ];
  const MAX_PLAYERS = 6;
  const HOUSE_MULT = [1, 5, 15, 35, 45, 55]; // renta = precio/10 × esto; 5 casas = hotel
  const START_MONEY = 1500, SALARY = 200, BAIL = 50;

  const houseCost = i => 50 * (Math.floor(i / 10) + 1);
  const groupOf = i => BOARD.flatMap((s, j) => (s.group && s.group === BOARD[i].group ? [j] : []));
  const ownsGroup = (room, pid, i) => groupOf(i).every(j => room.owned[j]?.owner === pid);
  const countOwned = (room, pid, type) => BOARD.filter((s, j) => s.type === type && room.owned[j]?.owner === pid).length;
  const others = (room, p) => room.players.filter(o => o !== p && !o.out);
  const die = () => 1 + Math.floor(Math.random() * 6);

  function rent(room, i) {
    const sp = BOARD[i], o = room.owned[i];
    if (!o || o.mortgaged) return 0;
    if (sp.type === 'transport') return 25 * 2 ** (countOwned(room, o.owner, 'transport') - 1);
    if (sp.type === 'util') return (room.dice[0] + room.dice[1]) * (countOwned(room, o.owner, 'util') === 2 ? 10 : 4);
    const base = sp.price / 10;
    if (o.houses) return base * HOUSE_MULT[o.houses];
    return ownsGroup(room, o.owner, i) ? base * 2 : base;
  }

  function log(room, text) {
    room.seq++; // el cliente lo usa para saber qué eventos son nuevos y animarlos
    room.log.unshift(text);
    room.log.length = Math.min(room.log.length, 40);
  }

  // Todo el dinero se mueve por aquí (null = el banco).
  function transfer(room, from, to, amount) {
    if (from) from.money -= amount; // puede quedar negativo: debe vender/hipotecar antes de terminar el turno
    if (to) to.money += amount;
  }

  function payNow(room, from, to, amount, why) {
    transfer(room, from, to, amount);
    log(room, `${from.name} paga $${amount}${to ? ' a ' + to.name : ''} (${why})`);
  }

  // Deuda del jugador de turno: la paga él mismo con sus billetes (acción 'pay') antes de seguir jugando.
  function owe(room, p, to, amount, why) {
    room.dues.push({ to: to?.id ?? null, amount, why });
    log(room, `${p.name} debe pagar $${amount}${to ? ' a ' + to.name : ''} (${why})`);
  }

  function sendToJail(room, p) {
    Object.assign(p, { pos: 10, jailed: true, jailTries: 0 });
    room.canRoll = false;
    log(room, `${p.name} va a la cárcel`);
  }

  function moveTo(room, p, to) {
    if (to < p.pos) {
      transfer(room, null, p, SALARY);
      log(room, `${p.name} pasa por la Salida y cobra $${SALARY}`);
    }
    p.pos = to;
    land(room, p);
  }

  const CARDS = [
    ['Avanza hasta la Salida', (r, p) => moveTo(r, p, 0)],
    ['Te pillaron evadiendo impuestos: ve a la cárcel', (r, p) => sendToJail(r, p)],
    ['Retrocede 3 casillas', (r, p) => { p.pos = (p.pos + 37) % 40; land(r, p); }],
    ['Toma un vuelo: avanza hasta el Aeropuerto', (r, p) => moveTo(r, p, 35)],
    ['Ganaste un concurso de cocina: cobra $100', 100],
    ['Error del banco a tu favor: cobra $150', 150],
    ['Te devuelven impuestos: cobra $50', 50],
    ['Vendiste tu bici vieja: cobra $30', 30],
    ['Multa por exceso de velocidad: paga $40', -40],
    ['Cuenta del dentista: paga $80', -80],
    ['Es tu cumpleaños: cada jugador te regala $20', (r, p) => others(r, p).forEach(o => payNow(r, o, p, 20, 'regalo'))], // no es su turno: se cobra solo
    ['Invitas la cena: paga $25 a cada jugador', (r, p) => others(r, p).forEach(o => owe(r, p, o, 25, 'cena'))],
    ['Mantenimiento: paga $30 por cada casa que tengas', (r, p) => {
      const n = Object.values(r.owned).filter(o => o.owner === p.id).reduce((s, o) => s + o.houses, 0);
      if (n) owe(r, p, null, 30 * n, 'mantenimiento');
    }],
  ];

  function land(room, p) {
    const sp = BOARD[p.pos], o = room.owned[p.pos];
    log(room, `${p.name} cae en ${sp.name}`);
    if (sp.type === 'tax') owe(room, p, null, sp.amount, sp.name);
    else if (sp.type === 'gojail') sendToJail(room, p);
    else if (sp.type === 'card') {
      const [text, effect] = CARDS[Math.floor(Math.random() * CARDS.length)];
      log(room, `Sorpresa: ${text}`);
      if (typeof effect === 'function') effect(room, p);
      else if (effect < 0) owe(room, p, null, -effect, 'Sorpresa');
      else transfer(room, null, p, effect);
    } else if (sp.price && !o) room.buyable = p.pos;
    else if (o && o.owner !== p.id && !o.mortgaged) {
      owe(room, p, room.players.find(x => x.id === o.owner), rent(room, p.pos), 'renta');
    }
  }

  function nextTurn(room) {
    Object.assign(room, { canRoll: true, doubles: 0, buyable: null, dues: [] });
    const alive = room.players.filter(p => !p.out);
    if (alive.length === 1) {
      room.winner = alive[0].id;
      return log(room, `¡${alive[0].name} gana la partida!`);
    }
    do room.turn = (room.turn + 1) % room.players.length;
    while (room.players[room.turn].out);
  }

  const ACTIONS = {
    roll(room, p) {
      if (!room.canRoll) return 'Ya tiraste los dados';
      if (p.money < 0) return 'Tienes deudas: vende casas o hipoteca antes de tirar';
      const d = [die(), die()], doubles = d[0] === d[1];
      Object.assign(room, { dice: d, canRoll: false, buyable: null, rolls: room.rolls + 1 });
      log(room, `${p.name} saca ${d[0]} + ${d[1]}`);
      if (p.jailed) {
        if (doubles) log(room, `${p.name} sale de la cárcel con dobles`);
        else if (++p.jailTries < 3) return log(room, `${p.name} sigue en la cárcel`);
        else owe(room, p, null, BAIL, 'fianza');
        p.jailed = false;
      } else if (doubles && ++room.doubles === 3) {
        log(room, `${p.name} sacó dobles 3 veces seguidas`);
        return sendToJail(room, p);
      } else if (doubles) room.canRoll = true;
      moveTo(room, p, (p.pos + d[0] + d[1]) % 40);
    },
    bail(room, p) {
      if (!p.jailed || !room.canRoll) return 'Ahora no puedes pagar la fianza';
      if (p.money < BAIL) return 'No te alcanza';
      payNow(room, p, null, BAIL, 'fianza');
      p.jailed = false;
    },
    pay(room, p) {
      const d = room.dues[0];
      if (!d) return 'No debes nada';
      if (p.money < d.amount) return 'No te alcanza: vende casas o hipoteca';
      room.dues.shift();
      payNow(room, p, room.players.find(x => x.id === d.to), d.amount, d.why);
    },
    buy(room, p) {
      const sp = BOARD[p.pos];
      if (room.buyable !== p.pos) return 'No puedes comprar esta casilla';
      if (p.money < sp.price) return 'No te alcanza';
      transfer(room, p, null, sp.price);
      room.owned[p.pos] = { owner: p.id, houses: 0, mortgaged: false };
      room.buyable = null;
      log(room, `${p.name} compra ${sp.name} por $${sp.price}`);
    },
    build(room, p, i) {
      const o = room.owned[i], g = groupOf(i);
      if (!g.length) return 'Solo se construye en calles';
      if (!ownsGroup(room, p.id, i)) return 'Necesitas todo el grupo de color';
      if (g.some(j => room.owned[j].mortgaged)) return 'Hay propiedades hipotecadas en el grupo';
      if (o.houses >= 5) return 'Ya tiene hotel';
      if (o.houses > Math.min(...g.map(j => room.owned[j].houses))) return 'Construye parejo: primero en las otras del grupo';
      if (p.money < houseCost(i)) return 'No te alcanza';
      transfer(room, p, null, houseCost(i));
      o.houses++;
      log(room, `${p.name} construye en ${BOARD[i].name} (${o.houses === 5 ? 'hotel' : o.houses + ' casa/s'})`);
    },
    sell(room, p, i) {
      const o = room.owned[i];
      if (!o.houses) return 'No hay casas para vender';
      o.houses--;
      transfer(room, null, p, houseCost(i) / 2);
      log(room, `${p.name} vende una casa de ${BOARD[i].name} por $${houseCost(i) / 2}`);
    },
    mortgage(room, p, i) {
      const o = room.owned[i];
      if (o.mortgaged) return 'Ya está hipotecada';
      if (groupOf(i).some(j => room.owned[j]?.houses)) return 'Primero vende las casas del grupo';
      o.mortgaged = true;
      transfer(room, null, p, BOARD[i].price / 2);
      log(room, `${p.name} hipoteca ${BOARD[i].name} por $${BOARD[i].price / 2}`);
    },
    unmortgage(room, p, i) {
      const o = room.owned[i], cost = Math.ceil(BOARD[i].price * 0.55);
      if (!o.mortgaged) return 'No está hipotecada';
      if (p.money < cost) return 'No te alcanza';
      o.mortgaged = false;
      transfer(room, p, null, cost);
      log(room, `${p.name} levanta la hipoteca de ${BOARD[i].name} por $${cost}`);
    },
    end(room, p) {
      const due = room.dues[0], broke = p.money < 0 || (due && p.money < due.amount);
      if (due && !broke) return 'Primero paga lo que debes';
      if (room.canRoll && !broke) return 'Primero tira los dados';
      if (broke) {
        const creditor = due && room.players.find(x => x.id === due.to);
        if (creditor && p.money > 0) payNow(room, p, creditor, p.money, 'todo lo que le quedaba');
        p.out = true;
        p.money = 0;
        for (const k in room.owned) if (room.owned[k].owner === p.id) delete room.owned[k];
        log(room, `${p.name} quiebra y sus propiedades vuelven al banco`);
      }
      nextTurn(room);
    },
  };
  const OWN_ACTIONS = ['build', 'sell', 'mortgage', 'unmortgage'];

  function newRoom(code) {
    return { code, started: false, players: [], owned: {}, turn: 0, canRoll: true, doubles: 0, dice: [1, 1], rolls: 0, seq: 0, dues: [], buyable: null, log: [], winner: null, at: Date.now() };
  }

  // Devuelve el jugador o un mensaje de error. Ya empezada la partida, el mismo nombre recupera su lugar.
  function join(room, name) {
    const same = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (room.started) return same || 'La partida ya empezó';
    if (same) return 'Ese nombre ya está en uso';
    if (room.players.length >= MAX_PLAYERS) return 'La sala está llena';
    const char = CHARACTERS.findIndex((c, k) => !room.players.some(x => x.char === k)); // el primero libre; se puede cambiar
    const p = { id: 'p' + room.players.length, name, char, color: CHARACTERS[char].color, money: START_MONEY, pos: 0, jailed: false, jailTries: 0, out: false };
    room.players.push(p);
    log(room, `${name} entró a la sala`);
    return p;
  }

  // Aplica una acción. Devuelve un mensaje de error o undefined si salió bien.
  function act(room, pid, a) {
    const p = room.players.find(x => x.id === pid);
    if (!p) return 'Jugador desconocido';
    if (a.type === 'start') {
      if (room.started) return 'La partida ya empezó';
      if (room.players[0] !== p) return 'Solo el anfitrión puede iniciar';
      if (room.players.length < 2) return 'Se necesitan al menos 2 jugadores';
      room.started = true;
      return log(room, `¡Comienza la partida! Empieza ${p.name}`);
    }
    if (a.type === 'pick') {
      if (room.started) return 'La partida ya empezó';
      if (!Number.isInteger(a.i) || !CHARACTERS[a.i]) return 'Personaje inválido';
      if (room.players.some(x => x !== p && x.char === a.i)) return 'Ese personaje ya lo eligió otro jugador';
      Object.assign(p, { char: a.i, color: CHARACTERS[a.i].color });
      return;
    }
    if (!room.started || room.winner) return 'La partida no está en curso';
    if (room.players[room.turn] !== p) return 'No es tu turno';
    if (!Object.hasOwn(ACTIONS, a.type)) return 'Acción desconocida';
    if (room.dues.length && !['pay', 'sell', 'mortgage', 'end'].includes(a.type)) return 'Primero paga lo que debes';
    if (OWN_ACTIONS.includes(a.type) && !(Number.isInteger(a.i) && room.owned[a.i]?.owner === pid)) return 'Esa propiedad no es tuya';
    return ACTIONS[a.type](room, p, a.i);
  }

  Object.assign(exports, { BOARD, COLORS, CHARACTERS, HOUSE_MULT, BAIL, houseCost, ownsGroup, rent, newRoom, join, act });
})(typeof module === 'object' ? module.exports : (window.Game = {}));
