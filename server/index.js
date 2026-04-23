'use strict';

const express    = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const GameRoom   = require('./GameRoom');

const app        = express();
const httpServer = createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

// 静的ファイル配信
app.use(express.static(path.join(__dirname, '..', 'public')));

// ゲームルーム（シングルルーム）
const room = new GameRoom(io);

io.on('connection', socket => {
  console.log(`[接続] ${socket.id}`);

  socket.on('joinGame', ({ name, color }) => {
    const ok = room.addPlayer(socket, name, color);
    if (!ok) socket.emit('joinError', { message: 'ゲーム中か満員です。' });
  });

  socket.on('startGame', () => room.tryStartGame(socket.id));

  socket.on('move',          ({ dx, dy })   => room.setPlayerMovement(socket.id, dx, dy));
  socket.on('kill',          ({ targetId }) => room.processKill(socket.id, targetId));
  socket.on('reportBody',    ({ bodyId })   => room.processReport(socket.id, bodyId));
  socket.on('callEmergency', ()             => room.processEmergency(socket.id));
  socket.on('completeTask',  ({ taskId })   => room.processTaskComplete(socket.id, taskId));
  socket.on('destroyTask',   ({ taskId })   => room.processDestroyTask(socket.id, taskId));
  socket.on('useVent',       ({ ventId })   => room.processVent(socket.id, ventId));

  socket.on('sabotage', ({ type, targetId }) =>
    room.processSabotage(socket.id, type, targetId));

  socket.on('repair',   ({ repairId }) =>
    room.processRepair(socket.id, repairId));

  socket.on('sendChat', ({ text })     => room.processChatMessage(socket.id, text));
  socket.on('vote',     ({ targetId }) => room.processVote(socket.id, targetId));

  socket.on('disconnect', () => {
    console.log(`[切断] ${socket.id}`);
    room.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  🕯️  Betrayal in Jerusalem  サーバー起動  ║');
  console.log(`║     http://localhost:${PORT}               ║`);
  console.log('╚═══════════════════════════════════════════╝\n');
});
