const socket = io("https://chat-p2p-v9l6.onrender.com");

const ROOM_TYPES = {
  PUBLIC: "public",
  PRIVATE: "private"
};

let roomCode = "";
let roomName = "";
let roomType = ROOM_TYPES.PUBLIC;
let username = "";
let activeRooms = [];
let selectedRoom = null;
let currentUsers = [];
let roomNameWasEdited = false;
let historyRenderedForCurrentRoom = false;
let isLeavingRoom = false;

function createRoom() {
  username = document.getElementById("username").value.trim();
  const roomInput = document.getElementById("room");
  const requestedRoomName = roomInput.value.trim() || getDefaultRoomName(username);
  const requestedRoomType = document.getElementById("roomType").value;
  const password = document.getElementById("roomPassword").value;

  hideLoginError();

  if (!username) {
    showLoginError("Informe seu nome para criar uma sala.");
    return;
  }

  if (!requestedRoomName) {
    showLoginError("Informe o nome da sala.");
    return;
  }

  if (requestedRoomType === ROOM_TYPES.PRIVATE && !password) {
    showLoginError("Informe uma senha para criar uma sala privada.");
    return;
  }

  roomInput.value = requestedRoomName;

  joinRoom({
    roomCode: requestedRoomName,
    roomName: requestedRoomName,
    roomType: requestedRoomType,
    password
  });
}

function joinSelectedRoom() {
  if (!selectedRoom) return;

  username = document.getElementById("username").value.trim();
  const password = document.getElementById("joinRoomPassword").value;

  hideLoginError();

  if (!username) {
    showLoginError("Informe seu nome para entrar em uma sala.");
  roomCode = document.getElementById("room").value.trim();
  const password = document.getElementById("roomPassword").value;

  hideLoginError();

  if (!username || !roomCode || !password) {
    showLoginError("Preencha seu nome, o código da sala e a senha.");
    return;
  }

  if (selectedRoom.type === ROOM_TYPES.PRIVATE && !password) {
    showLoginError("Informe a senha para entrar nesta sala privada.");
    document.getElementById("joinRoomPassword").focus();
    return;
  }

  joinRoom({
    roomCode: selectedRoom.roomCode,
    roomName: selectedRoom.name,
    roomType: selectedRoom.type,
    password
  });
}

function joinRoom({
  roomCode: requestedRoomCode,
  roomName: requestedRoomName,
  roomType: requestedRoomType,
  password = ""
}) {
  socket.emit("join-room", {
    roomCode: requestedRoomCode || requestedRoomName,
    roomName: requestedRoomName || requestedRoomCode,
    username,
    roomType: requestedRoomType,
    roomCode,
    username,
    password
  });
}

function enterChat(room) {
  const messages = document.getElementById("messages");

  messages.innerHTML = "";
  historyRenderedForCurrentRoom = false;

  roomCode = room.roomCode;
  roomName = room.roomName || room.roomCode;
  roomType = room.roomType || ROOM_TYPES.PUBLIC;
function enterChat(room, history = []) {
  const messages = document.getElementById("messages");

  messages.innerHTML = "";

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("chatScreen").classList.remove("hidden");

  updateRoomLabels();
  closeRoomModal();
  document.getElementById("messageInput").focus();
}

function leaveRoom() {
  if (!roomCode) {
    resetChatScreen();
    return;
  }

  isLeavingRoom = true;
  socket.emit("leave-room");
}

function resetChatScreen() {
  roomCode = "";
  roomName = "";
  roomType = ROOM_TYPES.PUBLIC;
  currentUsers = [];
  selectedRoom = null;
  historyRenderedForCurrentRoom = false;
  isLeavingRoom = false;

  document.getElementById("messages").innerHTML = "";
  document.getElementById("messageInput").value = "";
  document.getElementById("joinRoomPassword").value = "";
  document.getElementById("chatScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  renderSelectedRoom();
  renderUsers();
  closeRoomModal();
  socket.emit("get-active-rooms");
  document.getElementById("roomName").textContent = room;
  document.getElementById("chatTitle").textContent = `Sala ${room}`;

  history.forEach(renderMessage);
  messages.scrollTop = messages.scrollHeight;
  document.getElementById("messageInput").focus();
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message || !roomCode) return;

  socket.emit("send-message", {
    roomCode,
    username,
    message
  });

  input.value = "";
  input.focus();
}

function renderHistory(history = []) {
function renderMessage(data) {
  const messages = document.getElementById("messages");

  if (historyRenderedForCurrentRoom) return;

  messages.innerHTML = "";
  history.forEach(renderMessage);
  historyRenderedForCurrentRoom = true;
  messages.scrollTop = messages.scrollHeight;
}

function renderMessage(data) {
  const messages = document.getElementById("messages");
  const isMine = data.username === username;
  const row = document.createElement("div");

  row.classList.add("message-row");

  if (isMine) {
    row.classList.add("mine");
  }

  const initial = data.username.charAt(0).toUpperCase();

  row.innerHTML = `
    <div class="avatar">${escapeHTML(initial)}</div>

    <div class="message-content">
      <div class="message-meta">
        <strong>${isMine ? "Você" : escapeHTML(data.username)}</strong>
        <small>${escapeHTML(data.time || "")}</small>
        <small>${data.time || ""}</small>
      </div>

      <p>${escapeHTML(data.message)}</p>
    </div>
  `;

  messages.appendChild(row);
}

function showLoginError(message) {
  const loginError = document.getElementById("loginError");

  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideLoginError() {
  const loginError = document.getElementById("loginError");

  loginError.textContent = "";
  loginError.classList.add("hidden");
}

socket.on("join-success", (data) => {
  roomCode = data.roomCode;
  enterChat(data.roomCode, data.history);
});

socket.on("join-error", (data) => {
  showLoginError(data.message || "Não foi possível entrar na sala.");
});

socket.on("receive-message", (data) => {
  const messages = document.getElementById("messages");

  renderMessage(data);
  messages.scrollTop = messages.scrollHeight;
});

function renderSystemMessage(message) {
  const messages = document.getElementById("messages");
  const div = document.createElement("div");

  div.classList.add("system");
  div.textContent = message;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function renderActiveRooms() {
  const roomsList = document.getElementById("activeRoomsList");
  const roomsCount = document.getElementById("activeRoomsCount");

  roomsList.innerHTML = "";
  roomsCount.textContent = `${activeRooms.length} ${activeRooms.length === 1 ? "sala" : "salas"}`;

  if (activeRooms.length === 0) {
    const empty = document.createElement("p");
    empty.classList.add("empty-rooms");
    empty.textContent = "Nenhuma sala ativa no momento.";
    roomsList.appendChild(empty);
    return;
  }

  activeRooms.forEach((room) => {
    const button = document.createElement("button");
    button.classList.add("active-room-item");
    button.type = "button";
    button.innerHTML = `
      <span>
        <strong>${escapeHTML(room.name)}</strong>
        <small>${room.onlineCount} ${room.onlineCount === 1 ? "usuário" : "usuários"} online</small>
      </span>
      <em class="room-badge ${room.type === ROOM_TYPES.PRIVATE ? "private" : "public"}">
        ${getRoomTypeLabel(room.type)}
      </em>
    `;
    button.addEventListener("click", () => selectActiveRoom(room));
    roomsList.appendChild(button);
  });
}

function selectActiveRoom(room) {
  selectedRoom = room;

  document.getElementById("room").value = room.name;
  document.getElementById("roomType").value = room.type;
  updateCreatePasswordVisibility();

  renderSelectedRoom();

  if (room.type === ROOM_TYPES.PUBLIC) {
    joinSelectedRoom();
  } else {
    document.getElementById("joinRoomPassword").focus();
  }
}

function renderSelectedRoom() {
  const selectedRoomBox = document.getElementById("selectedRoomBox");
  const joinPasswordGroup = document.getElementById("joinPasswordGroup");

  if (!selectedRoom) {
    selectedRoomBox.classList.add("hidden");
    return;
  }

  document.getElementById("selectedRoomName").textContent = selectedRoom.name;
  document.getElementById("selectedRoomType").textContent = getRoomTypeLabel(selectedRoom.type);
  selectedRoomBox.classList.remove("hidden");
  joinPasswordGroup.classList.toggle("hidden", selectedRoom.type !== ROOM_TYPES.PRIVATE);
}

function renderUsers() {
  const usersList = document.getElementById("usersList");
  const modalUsersList = document.getElementById("modalUsersList");

  usersList.innerHTML = "";
  modalUsersList.innerHTML = "";

  currentUsers.forEach((user) => {
    const sidebarItem = document.createElement("li");
    sidebarItem.textContent = user.username;
    usersList.appendChild(sidebarItem);

    const modalItem = document.createElement("li");
    modalItem.innerHTML = `<span></span>${escapeHTML(user.username)}`;
    modalUsersList.appendChild(modalItem);
  });

  updateRoomLabels();
}

function updateRoomLabels() {
  const onlineText = `${currentUsers.length} ${currentUsers.length === 1 ? "usuário online" : "usuários online"}`;

  document.getElementById("roomName").textContent = roomName || "---";
  document.getElementById("roomTypeLabel").textContent = getRoomTypeLabel(roomType);
  document.getElementById("chatTitle").textContent = roomName || "Sala";
  document.getElementById("chatSubtitle").textContent = `${getRoomTypeLabel(roomType)} • ${onlineText}`;
  document.getElementById("modalRoomName").textContent = roomName || "---";
  document.getElementById("modalRoomType").textContent = getRoomTypeLabel(roomType);
  document.getElementById("modalOnlineCount").textContent = onlineText;
}

function openRoomModal() {
  if (window.innerWidth > 800 || !roomCode) return;

  document.getElementById("roomModal").classList.remove("hidden");
}

function closeRoomModal() {
  document.getElementById("roomModal").classList.add("hidden");
}

function updateDefaultRoomName() {
  const name = document.getElementById("username").value.trim();
  const roomInput = document.getElementById("room");

  if (!roomNameWasEdited || !roomInput.value.trim()) {
    roomInput.value = getDefaultRoomName(name);
    roomNameWasEdited = false;
  }
}

function getDefaultRoomName(name) {
  return name ? `Sala de ${name}` : "";
}

function updateCreatePasswordVisibility() {
  const isPrivate = document.getElementById("roomType").value === ROOM_TYPES.PRIVATE;

  document.getElementById("createPasswordGroup").classList.toggle("hidden", !isPrivate);
}

function showLoginError(message) {
  const loginError = document.getElementById("loginError");

  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideLoginError() {
  const loginError = document.getElementById("loginError");

  loginError.textContent = "";
  loginError.classList.add("hidden");
}

function getRoomTypeLabel(type) {
  return type === ROOM_TYPES.PRIVATE ? "Privada" : "Pública";
}

socket.on("active-rooms-update", (rooms) => {
  activeRooms = Array.isArray(rooms) ? rooms : [];
  renderActiveRooms();

  if (selectedRoom && !activeRooms.some((room) => room.roomCode === selectedRoom.roomCode)) {
    selectedRoom = null;
    renderSelectedRoom();
  } else if (selectedRoom) {
    selectedRoom = activeRooms.find((room) => room.roomCode === selectedRoom.roomCode) || selectedRoom;
    renderSelectedRoom();
  }
});

socket.on("join-success", (data) => {
  isLeavingRoom = false;
  hideLoginError();
  enterChat(data);

  if (Array.isArray(data.history) && data.history.length > 0) {
    renderHistory(data.history);
  }
});

socket.on("room-history", (history) => {
  renderHistory(history);
});

socket.on("join-error", (data) => {
  isLeavingRoom = false;
  showLoginError(data.message || "Não foi possível entrar na sala.");
});

socket.on("receive-message", (data) => {
  const messages = document.getElementById("messages");

  renderMessage(data);
  messages.scrollTop = messages.scrollHeight;
});

socket.on("system-message", (data) => {
  renderSystemMessage(data.message);
});

socket.on("users-update", (users) => {
  currentUsers = Array.isArray(users) ? users : [];
  renderUsers();
});

socket.on("left-room", () => {
  if (isLeavingRoom || roomCode) {
    resetChatScreen();
  }
});

document.getElementById("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("username").addEventListener("input", updateDefaultRoomName);

document.getElementById("room").addEventListener("input", (e) => {
  roomNameWasEdited = Boolean(e.target.value.trim());
});

document.getElementById("roomType").addEventListener("change", updateCreatePasswordVisibility);

document.getElementById("roomPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    createRoom();
  }
});

document.getElementById("joinRoomPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    joinSelectedRoom();
  }
});

document.getElementById("roomModal").addEventListener("click", (e) => {
  if (e.target.id === "roomModal") {
    closeRoomModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeRoomModal();
  }
});

socket.emit("get-active-rooms");
updateCreatePasswordVisibility();
updateDefaultRoomName();

document.getElementById("roomPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
