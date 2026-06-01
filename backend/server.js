const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {};

io.on("connection", (socket) => {
  console.log("Usuário conectado:", socket.id);

  socket.on("join-room", ({ roomCode, username }) => {
    socket.join(roomCode);

    socket.data.roomCode = roomCode;
    socket.data.username = username;

    if (!users[roomCode]) {
      users[roomCode] = [];
    }

    users[roomCode].push({
      id: socket.id,
      username
    });

    io.to(roomCode).emit("users-update", users[roomCode]);

    socket.to(roomCode).emit("system-message", {
      message: `${username} entrou na sala.`
    });

    console.log(`${username} entrou na sala ${roomCode}`);
  });

  socket.on("send-message", ({ roomCode, username, message }) => {
    io.to(roomCode).emit("receive-message", {
      username,
      message,
      time: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      })
    });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const username = socket.data.username;

    if (roomCode && users[roomCode]) {
      users[roomCode] = users[roomCode].filter(
        (user) => user.id !== socket.id
      );

      io.to(roomCode).emit("users-update", users[roomCode]);

      socket.to(roomCode).emit("system-message", {
        message: `${username} saiu da sala.`
      });

      if (users[roomCode].length === 0) {
        delete users[roomCode];
      }
    }

    console.log("Usuário desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});