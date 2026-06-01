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
const ROOM_TYPES = {
  PUBLIC: "public",
  PRIVATE: "private"
};

const users = {};
const rooms = loadRooms();

function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_FILE)) {
      return {};
    }

    const savedRooms = JSON.parse(fs.readFileSync(ROOMS_FILE, "utf8"));

    return Object.fromEntries(
      Object.entries(savedRooms).map(([roomCode, room]) => [
        roomCode,
        normalizeRoom(roomCode, room)
      ])
    );
  } catch (error) {
    console.error("Não foi possível carregar as salas salvas:", error);
    return {};
  }
}

function saveRooms() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

function normalizeRoom(roomCode, room = {}) {
  const hasPassword = Boolean(room.passwordHash && room.passwordSalt);
  const type = room.type || (hasPassword ? ROOM_TYPES.PRIVATE : ROOM_TYPES.PUBLIC);

  return {
    name: room.name || roomCode,
    type: type === ROOM_TYPES.PRIVATE ? ROOM_TYPES.PRIVATE : ROOM_TYPES.PUBLIC,
    passwordHash: room.passwordHash || null,
    passwordSalt: room.passwordSalt || null,
    messages: Array.isArray(room.messages)
      ? room.messages.slice(-MESSAGE_HISTORY_LIMIT)
      : []
  };
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
  const savedHash = Buffer.from(room.passwordHash, "hex");
  const currentHash = Buffer.from(passwordHash, "hex");

  return savedHash.length === currentHash.length && crypto.timingSafeEqual(savedHash, currentHash);
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function getRoomCode(roomName) {
  return sanitizeText(roomName);
}

function getRequestedRoomType(roomType) {
  if (roomType === ROOM_TYPES.PRIVATE || roomType === "privada") {
    return ROOM_TYPES.PRIVATE;
  }

  return ROOM_TYPES.PUBLIC;
}

function createRoom(roomCode, roomName, roomType, password) {
  rooms[roomCode] = {
    name: roomName || roomCode,
    type: roomType,
    passwordHash: null,
    passwordSalt: null,
    messages: []
  };

  if (roomType === ROOM_TYPES.PRIVATE) {
    const { passwordHash, passwordSalt } = hashPassword(password);
    rooms[roomCode].passwordHash = passwordHash;
    rooms[roomCode].passwordSalt = passwordSalt;
  }

  saveRooms();

  return rooms[roomCode];
}

function getFormattedTime() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function addMessageToHistory(roomCode, messageData) {
  const room = rooms[roomCode];

  if (!room) return;

  room.messages.push(messageData);

  if (room.messages.length > MESSAGE_HISTORY_LIMIT) {
    room.messages.shift();
  }

  saveRooms();
}

function getUsersInRoom(roomCode) {
  return users[roomCode] || [];
}

function getActiveRooms() {
  return Object.entries(users)
    .filter(([, roomUsers]) => roomUsers.length > 0)
    .map(([roomCode, roomUsers]) => {
      const room = rooms[roomCode] || normalizeRoom(roomCode);

      return {
        roomCode,
        name: room.name,
        type: room.type,
        onlineCount: roomUsers.length
      };
    })
    .sort((roomA, roomB) => roomA.name.localeCompare(roomB.name, "pt-BR"));
}

function emitActiveRooms() {
  io.emit("active-rooms-update", getActiveRooms());
}

function emitUsersUpdate(roomCode) {
  io.to(roomCode).emit("users-update", getUsersInRoom(roomCode));
}

function removeSocketFromCurrentRoom(socket, shouldNotify = true) {
  const currentRoomCode = socket.data.roomCode;
  const currentUsername = socket.data.username;

  if (!currentRoomCode || !users[currentRoomCode]) {
    socket.data.roomCode = null;
    return;
  }

  const wasInRoom = users[currentRoomCode].some((user) => user.id === socket.id);

  users[currentRoomCode] = users[currentRoomCode].filter((user) => user.id !== socket.id);
  socket.leave(currentRoomCode);
  socket.data.roomCode = null;

  if (!wasInRoom) return;

  if (users[currentRoomCode].length > 0) {
    emitUsersUpdate(currentRoomCode);

    if (shouldNotify && currentUsername) {
      socket.to(currentRoomCode).emit("system-message", {
        message: `${currentUsername} saiu da sala.`
      });
    }
  } else {
    delete users[currentRoomCode];
  }

  emitActiveRooms();
}

function joinExistingRoom(socket, { roomCode, username, password = "" }) {
  const sanitizedUsername = sanitizeText(username);
  const sanitizedRoomCode = getRoomCode(roomCode);
  const roomPassword = String(password || "").trim();
  const room = rooms[sanitizedRoomCode];

  if (!sanitizedUsername || !sanitizedRoomCode) {
    socket.emit("join-error", {
      message: "Preencha seu nome e o nome da sala."
    });
    return;
  }

  if (!room) {
    socket.emit("join-error", {
      message: "Sala não encontrada. Crie uma nova sala ou escolha uma sala ativa."
    });
    return;
  }

  if (room.type === ROOM_TYPES.PRIVATE) {
    if (!roomPassword) {
      socket.emit("join-error", {
        message: "Esta sala é privada. Informe a senha para entrar."
      });
      return;
    }

    if (!verifyPassword(roomPassword, room)) {
      socket.emit("join-error", {
        message: "Senha incorreta para esta sala. Verifique e tente novamente."
      });
      return;
    }
  }

  addSocketToRoom(socket, sanitizedRoomCode, sanitizedUsername, room);
}

function addSocketToRoom(socket, sanitizedRoomCode, sanitizedUsername, room) {
  if (socket.data.roomCode && socket.data.roomCode !== sanitizedRoomCode) {
    removeSocketFromCurrentRoom(socket);
  }

  if (!users[sanitizedRoomCode]) {
    users[sanitizedRoomCode] = [];
  }

  const alreadyInRoom = users[sanitizedRoomCode].some((user) => user.id === socket.id);

  socket.join(sanitizedRoomCode);
  socket.data.roomCode = sanitizedRoomCode;
  socket.data.username = sanitizedUsername;

  if (alreadyInRoom) {
    users[sanitizedRoomCode] = users[sanitizedRoomCode].map((user) =>
      user.id === socket.id ? { ...user, username: sanitizedUsername } : user
    );
  } else {
    users[sanitizedRoomCode].push({
      id: socket.id,
      username: sanitizedUsername
    });
  }

  socket.emit("join-success", {
    roomCode: sanitizedRoomCode,
    roomName: room.name,
    roomType: room.type,
    history: room.messages
  });

  socket.emit("room-history", room.messages);
  emitUsersUpdate(sanitizedRoomCode);
  emitActiveRooms();

  if (!alreadyInRoom) {
    socket.to(sanitizedRoomCode).emit("system-message", {
      message: `${sanitizedUsername} entrou na sala.`
    });
  }

  console.log(`${sanitizedUsername} entrou na sala ${sanitizedRoomCode}`);
}

io.on("connection", (socket) => {
  console.log("Usuário conectado:", socket.id);

  socket.emit("active-rooms-update", getActiveRooms());

  socket.on("get-active-rooms", () => {
    socket.emit("active-rooms-update", getActiveRooms());
  });

  socket.on("create-room", ({ roomName, username, password, roomType }) => {
    const sanitizedUsername = sanitizeText(username);
    const sanitizedRoomName = sanitizeText(roomName);
    const sanitizedRoomCode = getRoomCode(sanitizedRoomName);
    const requestedRoomType = getRequestedRoomType(roomType);
    const roomPassword = String(password || "").trim();

    if (!sanitizedUsername || !sanitizedRoomCode) {
      socket.emit("join-error", {
        message: "Preencha seu nome e o nome da sala."
      });
      return;
    }

    if (rooms[sanitizedRoomCode]) {
      socket.emit("join-error", {
        message: "Já existe uma sala com esse nome. Escolha outro nome ou entre pela lista de salas ativas."
      });
      return;
    }

    if (requestedRoomType === ROOM_TYPES.PRIVATE && !roomPassword) {
      socket.emit("join-error", {
        message: "Informe uma senha para criar uma sala privada."
      });
      return;
    }

    const room = createRoom(sanitizedRoomCode, sanitizedRoomName, requestedRoomType, roomPassword);
    addSocketToRoom(socket, sanitizedRoomCode, sanitizedUsername, room);
  });

  socket.on("join-room", ({ roomCode, username, password }) => {
    joinExistingRoom(socket, { roomCode, username, password });
  });

  socket.on("leave-room", () => {
    removeSocketFromCurrentRoom(socket);
    socket.emit("left-room");
  });

  socket.on("send-message", ({ roomCode, message }) => {
    const sanitizedRoomCode = sanitizeText(roomCode);
    const sanitizedMessage = sanitizeText(message);

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
    removeSocketFromCurrentRoom(socket);
    console.log("Usuário desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
