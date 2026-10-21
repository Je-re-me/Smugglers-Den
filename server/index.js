import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { Game } from './game.js';

const PORT = process.env.PORT ?? 3000;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const game = new Game();
const ROUND_BREAK_MS = 5000;
let nextRoundTimer = null;

app.use(express.static(publicDir));

function broadcast() {
  io.emit('state', game.publicState());
  for (const socket of io.sockets.sockets.values()) {
    const view = game.privateView(socket.id);
    if (view) socket.emit('private', view);
  }
}

function scheduleNextRound() {
  nextRoundTimer = setTimeout(() => {
    nextRoundTimer = null;
    if (game.advanceRound()) broadcast();
  }, ROUND_BREAK_MS);
}

function cancelNextRound() {
  clearTimeout(nextRoundTimer);
  nextRoundTimer = null;
}

io.on('connection', (socket) => {
  socket.emit('state', game.publicState());

  socket.on('join', (payload = {}, ack) => {
    const result = game.join({ ...payload, socketId: socket.id });
    ack?.(result);
    if (result.ok) broadcast();
  });

  socket.on('start', (ack) => {
    const result = game.start(socket.id);
    ack?.(result);
    if (result.ok) broadcast();
  });

  socket.on('pack', (payload, ack) => {
    const result = game.submitPackage(socket.id, payload);
    ack?.(result);
    if (result.ok) broadcast();
  });

  socket.on('decide', (payload, ack) => {
    const result = game.decide(socket.id, payload);
    ack?.(result);
    if (!result.ok) return;
    broadcast();
    if (game.intermission) scheduleNextRound();
  });

  socket.on('revise', (payload, ack) => {
    const result = game.revise(socket.id, payload);
    ack?.(result);
    if (result.ok) broadcast();
  });

  socket.on('reset', (ack) => {
    const result = game.reset(socket.id);
    ack?.(result);
    if (result.ok) {
      cancelNextRound();
      io.emit('reset');
      broadcast();
    }
  });

  socket.on('disconnect', () => {
    const wasPlaying = game.phase === 'playing';
    if (!game.disconnect(socket.id)) return;
    if (wasPlaying) {
      cancelNextRound();
      io.emit('reset');
    }
    broadcast();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Smugglers' Den listening on http://localhost:${PORT}`);
});
