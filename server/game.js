import { randomInt, randomUUID } from 'node:crypto';
import { CONTRABAND_POOL, GOODS, NORMAL_POOL } from './cards.js';

export const PLAYER_COUNT = 4;
export const ROTATIONS = 3;
export const TOTAL_ROUNDS = PLAYER_COUNT * ROTATIONS;
export const STARTING_CURRENCY = 50;
const NORMAL_CARDS_PER_SMUGGLER = 4;
const CONTRABAND_CARDS_PER_SMUGGLER = 4;
const MAX_PACKAGE_CARDS = 5;
const MAX_NAME_LENGTH = 20;

const sumValues = (cards) => cards.reduce((total, card) => total + card.value, 0);
const sumCaught = (cards) => cards.reduce((total, card) => total + card.caughtValue, 0);
const isHonest = (pkg) => pkg.cards.every((c) => c.type === 'normal' && c.id === pkg.declared.id);

export class Game {
  constructor() {
    this.players = [];
    this.phase = 'lobby';
    this.round = 0;
    this.results = null;
    this.intermission = false;
  }

  join({ name, token, socketId }) {
    if (token) {
      const returning = this.players.find((p) => p.token === token);
      if (returning) {
        returning.socketId = socketId;
        returning.connected = true;
        return { ok: true, token };
      }
    }

    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Name must be 1-${MAX_NAME_LENGTH} characters` };
    }
    if (this.phase !== 'lobby') return { ok: false, error: 'Game already started' };
    if (this.players.length >= PLAYER_COUNT) return { ok: false, error: 'Game is full' };

    const player = {
      token: randomUUID(),
      socketId,
      name: trimmed,
      connected: true,
      balance: STARTING_CURRENCY,
      hand: [],
      package: null,
    };
    this.players.push(player);
    return { ok: true, token: player.token };
  }

  disconnect(socketId) {
    const seat = this.seatOf(socketId);
    if (seat === -1) return false;
    if (this.phase === 'playing') {
      this.clear();
      return true;
    }
    this.players.splice(seat, 1);
    return true;
  }

  clear() {
    this.players = [];
    this.phase = 'lobby';
    this.round = 0;
    this.results = null;
    this.intermission = false;
  }

  reset(socketId) {
    if (this.seatOf(socketId) === -1) {
      return { ok: false, error: 'Only seated players can reset the game' };
    }
    this.clear();
    return { ok: true };
  }

  start(socketId) {
    if (this.seatOf(socketId) === -1) {
      return { ok: false, error: 'Only seated players can start the game' };
    }
    if (this.phase !== 'lobby') return { ok: false, error: 'Game already started' };
    if (this.players.length < PLAYER_COUNT) {
      return { ok: false, error: `Need ${PLAYER_COUNT} players to start` };
    }
    if (this.players.some((p) => !p.connected)) {
      return { ok: false, error: 'Waiting for a player to reconnect' };
    }

    this.phase = 'playing';
    this.round = 1;
    this.results = null;
    this.dealRound();
    return { ok: true };
  }

  dealRound() {
    const inspector = this.inspectorSeat();
    const drawCards = (pool, count) => Array.from({ length: count }, () => pool[randomInt(pool.length)]);
    this.players.forEach((player, seat) => {
      player.package = null;
      player.hand =
        seat === inspector
          ? []
          : [
              ...drawCards(NORMAL_POOL, NORMAL_CARDS_PER_SMUGGLER),
              ...drawCards(CONTRABAND_POOL, CONTRABAND_CARDS_PER_SMUGGLER),
            ];
    });
  }

  submitPackage(socketId, { cardIndexes, good, bribe } = {}) {
    const seat = this.seatOf(socketId);
    if (seat === -1) return { ok: false, error: 'Only seated players can pack' };
    if (this.phase !== 'playing') return { ok: false, error: 'No round in progress' };
    if (seat === this.inspectorSeat()) return { ok: false, error: 'The inspector cannot pack' };

    const player = this.players[seat];
    if (player.package) return { ok: false, error: 'Already packed this round' };
    if (!Array.isArray(cardIndexes) || cardIndexes.length < 1 || cardIndexes.length > MAX_PACKAGE_CARDS) {
      return { ok: false, error: 'Pick 1 to 5 cards' };
    }
    const unique = new Set(cardIndexes);
    const validIndex = (i) => Number.isInteger(i) && i >= 0 && i < player.hand.length;
    if (unique.size !== cardIndexes.length || !cardIndexes.every(validIndex)) {
      return { ok: false, error: 'Invalid card selection' };
    }
    const declared = GOODS.find((g) => g.id === good);
    if (!declared) return { ok: false, error: 'Declare one of the four goods' };
    const cap = declared.value * cardIndexes.length;
    if (!Number.isInteger(bribe) || bribe < 0 || bribe > cap) {
      return { ok: false, error: `Bribe must be between 0 and ${cap}` };
    }

    player.package = {
      declared,
      bribe,
      cards: cardIndexes.map((i) => player.hand[i]),
      status: 'submitted',
      winner: null,
    };
    player.hand = player.hand.filter((_, i) => !unique.has(i));
    return { ok: true };
  }

  decide(socketId, { target, action } = {}) {
    if (this.phase !== 'playing') return { ok: false, error: 'No round in progress' };
    if (this.seatOf(socketId) !== this.inspectorSeat()) {
      return { ok: false, error: 'Only the inspector can decide' };
    }
    if (!this.allPacked()) return { ok: false, error: 'Waiting for all smugglers to submit' };

    const seat = this.packageSeat(target);
    if (seat === null) return { ok: false, error: 'No package there' };
    const pkg = this.players[seat].package;

    if (pkg.status === 'submitted' && action === 'pass') this.passPackage(seat);
    else if (pkg.status === 'submitted' && action === 'inspect') pkg.status = 'suspected';
    else if (pkg.status === 'awaitingFinal' && action === 'pass') this.passPackage(seat);
    else if (pkg.status === 'awaitingFinal' && action === 'look') this.lookAt(seat);
    else return { ok: false, error: 'That action is not available for this package' };

    this.settleRound();
    return { ok: true };
  }

  revise(socketId, { bribe } = {}) {
    const seat = this.seatOf(socketId);
    const pkg = seat === -1 ? null : this.players[seat].package;
    if (this.phase !== 'playing' || pkg?.status !== 'suspected') {
      return { ok: false, error: 'No bribe revision is pending' };
    }
    const cap = pkg.declared.value * pkg.cards.length;
    if (!Number.isInteger(bribe) || bribe < 0 || bribe > cap) {
      return { ok: false, error: `Bribe must be between 0 and ${cap}` };
    }
    pkg.bribe = bribe;
    pkg.status = 'awaitingFinal';
    return { ok: true };
  }

  passPackage(seat) {
    const player = this.players[seat];
    const inspector = this.players[this.inspectorSeat()];
    const pkg = player.package;
    player.balance -= pkg.bribe;
    inspector.balance += pkg.bribe;
    player.balance += sumValues(pkg.cards);
    pkg.status = 'passed';
  }

  lookAt(seat) {
    const player = this.players[seat];
    const inspector = this.players[this.inspectorSeat()];
    const pkg = player.package;
    const total = sumCaught(pkg.cards);

    if (!isHonest(pkg)) {
      player.balance -= total;
      inspector.balance += total;
      pkg.winner = 'inspector';
    } else {
      inspector.balance -= total;
      player.balance += total;
      pkg.winner = 'smuggler';
    }
    pkg.status = 'resolved';
  }

  settleRound() {
    const settled = this.players.every(
      (p, seat) =>
        seat === this.inspectorSeat() || ['passed', 'resolved'].includes(p.package?.status),
    );
    if (!settled) return;
    if (this.round >= TOTAL_ROUNDS) {
      this.finishGame();
      return;
    }
    this.intermission = true;
  }

  advanceRound() {
    if (this.phase !== 'playing' || !this.intermission) return false;
    this.intermission = false;
    this.round += 1;
    this.dealRound();
    return true;
  }

  finishGame() {
    this.results = {
      winners: this.winners(),
      balances: this.players.map((p) => ({ name: p.name, balance: p.balance })),
    };
    this.phase = 'lobby';
    this.round = 0;
    this.intermission = false;
    for (const player of this.players) {
      player.balance = STARTING_CURRENCY;
      player.hand = [];
      player.package = null;
    }
  }

  seatOf(socketId) {
    return this.players.findIndex((p) => p.socketId === socketId);
  }

  packageSeat(seat) {
    if (!Number.isInteger(seat) || seat === this.inspectorSeat()) return null;
    return this.players[seat]?.package ? seat : null;
  }

  allPacked() {
    return this.players.every((p, seat) => seat === this.inspectorSeat() || Boolean(p.package));
  }

  stage() {
    if (this.phase !== 'playing') return null;
    return this.allPacked() ? 'inspecting' : 'packing';
  }

  winners() {
    const top = Math.max(...this.players.map((p) => p.balance));
    return this.players.filter((p) => p.balance === top).map((p) => p.name);
  }

  inspectorSeat() {
    return (this.round - 1) % PLAYER_COUNT;
  }

  publicState() {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: TOTAL_ROUNDS,
      playerCount: PLAYER_COUNT,
      inspectorSeat: this.phase === 'playing' ? this.inspectorSeat() : null,
      stage: this.stage(),
      goods: GOODS,
      results: this.results,
      players: this.players.map((p, seat) => ({
        seat,
        name: p.name,
        balance: p.balance,
        connected: p.connected,
        packed: Boolean(p.package),
        status: p.package?.status ?? null,
        cardCount: p.package?.cards.length ?? null,
        declared: p.package?.declared ?? null,
        bribe: p.package?.bribe ?? null,
        winner: p.package?.winner ?? null,
        cards: ['passed', 'resolved'].includes(p.package?.status) ? p.package.cards : null,
      })),
    };
  }

  privateView(socketId) {
    const seat = this.seatOf(socketId);
    if (seat === -1) return null;
    const player = this.players[seat];
    return {
      seat,
      hand: player.hand,
      packedCards: player.package?.cards ?? null,
      packedDeclared: player.package?.declared ?? null,
      packedBribe: player.package?.bribe ?? null,
    };
  }
}
