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

// ルーム管理
const rooms = new Map(); // roomId -> GameRoom
const socketToRoom = new Map(); // socket.id -> roomId

function getRoom(socket) {
  const roomId = socketToRoom.get(socket.id);
  return rooms.get(roomId);
}

io.on('connection', socket => {
  console.log(`[接続] ${socket.id}`);

  socket.on('joinGame', ({ name, color, roomId }) => {
    const rid = roomId || 'default';
    
    // ルームが存在しなければ作成
    if (!rooms.has(rid)) {
      rooms.set(rid, new GameRoom(io, rid));
    }
    
    const room = rooms.get(rid);
    const ok = room.addPlayer(socket, name, color);
    
    if (ok) {
      socketToRoom.set(socket.id, rid);
    } else {
      socket.emit('joinError', { message: 'ゲーム中か満員です。' });
    }
  });

  socket.on('startGame', () => getRoom(socket)?.tryStartGame(socket.id));
  socket.on('move',          ({ dx, dy })   => getRoom(socket)?.setPlayerMovement(socket.id, dx, dy));
  socket.on('kill',          ({ targetId }) => getRoom(socket)?.processKill(socket.id, targetId));
  socket.on('reportBody',    ({ bodyId })   => getRoom(socket)?.processReport(socket.id, bodyId));
  socket.on('callEmergency', ()             => getRoom(socket)?.processEmergency(socket.id));
  socket.on('completeTask',  ({ taskId })   => getRoom(socket)?.processTaskComplete(socket.id, taskId));
  socket.on('destroyTask',   ({ taskId })   => getRoom(socket)?.processDestroyTask(socket.id, taskId));
  socket.on('useVent',       ({ ventId })   => getRoom(socket)?.processVent(socket.id, ventId));

  socket.on('sabotage', ({ type, targetId }) =>
    getRoom(socket)?.processSabotage(socket.id, type, targetId));

  socket.on('repair',   ({ repairId }) =>
    getRoom(socket)?.processRepair(socket.id, repairId));

  socket.on('sendChat', ({ text })     => getRoom(socket)?.processChatMessage(socket.id, text));
  socket.on('vote',     ({ targetId }) => getRoom(socket)?.processVote(socket.id, targetId));

  socket.on('disconnect', () => {
    console.log(`[切断] ${socket.id}`);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.removePlayer(socket.id);
        if (room.players.size === 0) {
          room.destroy();
          rooms.delete(roomId);
          console.log(`[ルーム削除] ${roomId}`);
        }
      }
      socketToRoom.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  🕯️  Betrayal in Jerusalem  サーバー起動  ║');
  console.log(`║     http://localhost:${PORT}               ║`);
  console.log('╚═══════════════════════════════════════════╝\n');
});
