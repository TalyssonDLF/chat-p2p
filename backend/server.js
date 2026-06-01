const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

const MESSAGE_HISTORY_LIMIT = 100;
const DATA_DIR = path.join(__dirname, "data");
const ROOMS_FILE = path.join(DATA_DIR, "rooms.json");

const users = {};
const rooms = loadRooms();

function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8"));
  } catch (error) {
    console.error("Não foi possível carregar as salas salvas:", error);
    return {};
  }
}

function saveRooms() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");

  return { passwordHash, passwordSalt: salt };
}

function verifyPassword(password, room) {
  if (!room.passwordHash || !room.passwordSalt) {
    return false;
  }

  const { passwordHash } = hashPassword(password, room.passwordSalt);

  return crypto.timingSafeEqual(
    Buffer.from(room.passwordHash, "hex"),
    Buffer.from(passwordHash, "hex")
  );
}

function getRoom(roomCode) {
  if (!rooms[roomCode]) {
    rooms[roomCode] = {
      passwordHash: null,
      passwordSalt: null,
      messages: []
    };
  }

  return rooms[roomCode];
}

function getFormattedTime() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function addMessageToHistory(roomCode, messageData) {
  const room = getRoom(roomCode);

  room.messages.push(messageData);

  if (room.messages.length > MESSAGE_HISTORY_LIMIT) {
    room.messages = room.messages.slice(-MESSAGE_HISTORY_LIMIT);
  }

  saveRooms();
}

io.on("connection", (socket) => {
  console.log("Usuário conectado:", socket.id);

  socket.on("join-room", ({ roomCode, username, password }) => {
    const sanitizedRoomCode = String(roomCode || "").trim();
    const sanitizedUsername = String(username || "").trim();
    const roomPassword = String(password || "");

    if (!sanitizedRoomCode || !sanitizedUsername || !roomPassword) {
      socket.emit("join-error", {
        message: "Preencha seu nome, o código da sala e a senha."
      });
      return;
    }

    const room = getRoom(sanitizedRoomCode);

    if (room.passwordHash && !verifyPassword(roomPassword, room)) {
      socket.emit("join-error", {
        message: "Senha incorreta para esta sala. Verifique e tente novamente."
      });
      return;
    }

    if (!room.passwordHash) {
      const { passwordHash, passwordSalt } = hashPassword(roomPassword);
      room.passwordHash = passwordHash;
      room.passwordSalt = passwordSalt;
      saveRooms();
    }

    socket.join(sanitizedRoomCode);

    socket.data.roomCode = sanitizedRoomCode;
    socket.data.username = sanitizedUsername;

    if (!users[sanitizedRoomCode]) {
      users[sanitizedRoomCode] = [];
    }

    users[sanitizedRoomCode].push({
      id: socket.id,
      username: sanitizedUsername
    });

    socket.emit("join-success", {
      roomCode: sanitizedRoomCode,
      history: room.messages
    });

    io.to(sanitizedRoomCode).emit("users-update", users[sanitizedRoomCode]);

    socket.to(sanitizedRoomCode).emit("system-message", {
      message: `${sanitizedUsername} entrou na sala.`
    });

    console.log(`${sanitizedUsername} entrou na sala ${sanitizedRoomCode}`);
  });

  socket.on("send-message", ({ roomCode, message }) => {
    const sanitizedRoomCode = String(roomCode || "").trim();
    const sanitizedMessage = String(message || "").trim();

    if (
      socket.data.roomCode !== sanitizedRoomCode ||
      !socket.data.username ||
      !sanitizedMessage
    ) {
      return;
    }

    const messageData = {
      username: socket.data.username,
      message: sanitizedMessage,
      time: getFormattedTime()
    };

    addMessageToHistory(sanitizedRoomCode, messageData);

    io.to(sanitizedRoomCode).emit("receive-message", messageData);
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
