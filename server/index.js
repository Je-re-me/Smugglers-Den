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

app.use(express.static(publicDir));

function broadcast() {
  io.emit('state', game.publicState());
  for (const socket of io.sockets.sockets.values()) {
    const view = game.privateView(socket.id);
    if (view) socket.emit('private', view);
  }
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

  socket.on('reset', (ack) => {
    const result = game.reset(socket.id);
    ack?.(result);
    if (result.ok) {
      io.emit('reset');
      broadcast();
    }
  });

  socket.on('disconnect', () => {
    const wasPlaying = game.phase === 'playing';
    if (!game.disconnect(socket.id)) return;
    if (wasPlaying) io.emit('reset');
    broadcast();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Smugglers' Den listening on http://localhost:${PORT}`);
});
