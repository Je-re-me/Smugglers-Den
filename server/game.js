import { randomInt, randomUUID } from 'node:crypto';
import { CARD_POOL } from './cards.js';

export const PLAYER_COUNT = 4;
export const ROTATIONS = 3;
export const TOTAL_ROUNDS = PLAYER_COUNT * ROTATIONS;
export const STARTING_CURRENCY = 50;
const CARDS_PER_SMUGGLER = 4;
const MAX_NAME_LENGTH = 20;

export class Game {
  constructor() {
    this.players = [];
    this.phase = 'lobby';
    this.round = 0;
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
    };
    this.players.push(player);
    return { ok: true, token: player.token };
  }

  disconnect(socketId) {
    const player = this.players.find((p) => p.socketId === socketId);
    if (!player) return false;
    if (this.phase === 'playing') {
      this.clear();
      return true;
    }
    player.connected = false;
    player.socketId = null;
    return true;
  }

  clear() {
    this.players = [];
    this.phase = 'lobby';
    this.round = 0;
  }

  reset(socketId) {
    if (!this.players.some((p) => p.socketId === socketId)) {
      return { ok: false, error: 'Only seated players can reset the game' };
    }
    this.clear();
    return { ok: true };
  }

  start(socketId) {
    if (!this.players.some((p) => p.socketId === socketId)) {
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
    this.dealRound();
    return { ok: true };
  }

  dealRound() {
    const inspector = this.inspectorSeat();
    this.players.forEach((player, seat) => {
      player.hand =
        seat === inspector
          ? []
          : Array.from({ length: CARDS_PER_SMUGGLER }, () => CARD_POOL[randomInt(CARD_POOL.length)]);
    });
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
      players: this.players.map((p, seat) => ({
        seat,
        name: p.name,
        balance: p.balance,
        connected: p.connected,
      })),
    };
  }

  privateView(socketId) {
    const seat = this.players.findIndex((p) => p.socketId === socketId);
    if (seat === -1) return null;
    return { seat, hand: this.players[seat].hand };
  }
}
