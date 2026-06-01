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
let currentUsers = [];
let roomNameWasEdited = false;
let historyRenderedForCurrentRoom = false;
let isLeavingRoom = false;
let pendingPrivateRoomCode = null;

function createRoom() {
  username = getUsername();
  const roomInput = document.getElementById("room");
  const requestedRoomName = roomInput.value.trim() || getDefaultRoomName(username);
  const requestedRoomType = document.getElementById("roomType").value;
  const password = document.getElementById("roomPassword").value.trim();

  hideLoginError();

  if (!username) {
    showLoginError("Informe seu nome para criar uma sala.");
    document.getElementById("username").focus();
    return;
  }

  if (!requestedRoomName) {
    showLoginError("Informe o nome da sala.");
    roomInput.focus();
    return;
  }

  if (requestedRoomType === ROOM_TYPES.PRIVATE && !password) {
    showLoginError("Informe uma senha para criar uma sala privada.");
    document.getElementById("roomPassword").focus();
    return;
  }

  roomInput.value = requestedRoomName;

  socket.emit("create-room", {
    roomName: requestedRoomName,
    username,
    roomType: requestedRoomType,
    password
  });
}

function joinActiveRoom(room, password = "") {
  username = getUsername();
  hideLoginError();

  if (!username) {
    showLoginError("Informe seu nome para entrar em uma sala.");
    document.getElementById("username").focus();
    return;
  }

  if (room.type === ROOM_TYPES.PRIVATE && !password.trim()) {
    pendingPrivateRoomCode = room.roomCode;
    renderActiveRooms();
    const passwordInput = document.getElementById(getJoinPasswordInputId(room.roomCode));
    passwordInput?.focus();
    return;
  }

  socket.emit("join-room", {
    roomCode: room.roomCode,
    username,
    password: password.trim()
  });
}

function submitPrivateRoomPassword(room) {
  const passwordInput = document.getElementById(getJoinPasswordInputId(room.roomCode));
  joinActiveRoom(room, passwordInput?.value || "");
}

function enterChat(room) {
  const messages = document.getElementById("messages");

  messages.innerHTML = "";
  historyRenderedForCurrentRoom = false;
  roomCode = room.roomCode;
  roomName = room.roomName || room.name || room.roomCode;
  roomType = room.roomType || room.type || ROOM_TYPES.PUBLIC;
  pendingPrivateRoomCode = null;

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
  historyRenderedForCurrentRoom = false;
  isLeavingRoom = false;

  document.getElementById("messages").innerHTML = "";
  document.getElementById("messageInput").value = "";
  document.getElementById("chatScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  renderUsers();
  closeRoomModal();
  socket.emit("get-active-rooms");
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message || !roomCode) return;

  socket.emit("send-message", {
    roomCode,
    message
  });

  input.value = "";
  input.focus();
}

function renderHistory(history = []) {
  const messages = document.getElementById("messages");

  if (historyRenderedForCurrentRoom) return;

  messages.innerHTML = "";
  history.forEach(renderMessage);
  historyRenderedForCurrentRoom = true;
  messages.scrollTop = messages.scrollHeight;
}

function renderMessage(data) {
  const messages = document.getElementById("messages");
  const messageUsername = data.username || "Sistema";
  const isMine = messageUsername === username;
  const row = document.createElement("div");

  row.classList.add("message-row");

  if (isMine) {
    row.classList.add("mine");
  }

  const initial = messageUsername.charAt(0).toUpperCase();

  row.innerHTML = `
    <div class="avatar">${escapeHTML(initial)}</div>

    <div class="message-content">
      <div class="message-meta">
        <strong>${isMine ? "Você" : escapeHTML(messageUsername)}</strong>
        <small>${escapeHTML(data.time || "")}</small>
      </div>

      <p>${escapeHTML(data.message || "")}</p>
    </div>
  `;

  messages.appendChild(row);
}

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
    const card = document.createElement("article");
    const isPrivate = room.type === ROOM_TYPES.PRIVATE;
    const showPasswordInput = isPrivate && pendingPrivateRoomCode === room.roomCode;

    card.classList.add("active-room-card");
    card.innerHTML = `
      <div class="active-room-info">
        <strong>${escapeHTML(room.name)}</strong>
        <small>${room.onlineCount} ${room.onlineCount === 1 ? "usuário" : "usuários"} online</small>
      </div>

      <em class="room-badge ${isPrivate ? "private" : "public"}">${getRoomTypeLabel(room.type)}</em>

      <div class="active-room-actions">
        <button type="button" class="join-room-button">Entrar</button>
      </div>

      <div class="join-password-box ${showPasswordInput ? "" : "hidden"}">
        <label for="${getJoinPasswordInputId(room.roomCode)}">Senha da sala privada</label>
        <input id="${getJoinPasswordInputId(room.roomCode)}" type="password" placeholder="Senha da sala" autocomplete="current-password" />
        <button type="button" class="confirm-private-join-button">Confirmar entrada</button>
      </div>
    `;

    card.querySelector(".join-room-button").addEventListener("click", () => joinActiveRoom(room));
    card.querySelector(".confirm-private-join-button").addEventListener("click", () => submitPrivateRoomPassword(room));
    card.querySelector("input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        submitPrivateRoomPassword(room);
      }
    });

    roomsList.appendChild(card);
  });
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
  const name = getUsername();
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
  const passwordGroup = document.getElementById("createPasswordGroup");
  const passwordInput = document.getElementById("roomPassword");

  passwordGroup.classList.toggle("hidden", !isPrivate);

  if (!isPrivate) {
    passwordInput.value = "";
  }
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

function getUsername() {
  return document.getElementById("username").value.trim();
}

function getRoomTypeLabel(type) {
  return type === ROOM_TYPES.PRIVATE ? "Privada" : "Pública";
}

function getJoinPasswordInputId(joinRoomCode) {
  return `join-password-${btoa(unescape(encodeURIComponent(joinRoomCode))).replaceAll("=", "")}`;
}

socket.on("active-rooms-update", (rooms) => {
  activeRooms = Array.isArray(rooms) ? rooms : [];

  if (pendingPrivateRoomCode && !activeRooms.some((room) => room.roomCode === pendingPrivateRoomCode)) {
    pendingPrivateRoomCode = null;
  }

  renderActiveRooms();
});

socket.on("join-success", (data) => {
  isLeavingRoom = false;
  hideLoginError();
  enterChat(data);

  if (Array.isArray(data.history)) {
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

document.getElementById("messageInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("username").addEventListener("input", updateDefaultRoomName);

document.getElementById("room").addEventListener("input", (event) => {
  roomNameWasEdited = Boolean(event.target.value.trim());
});

document.getElementById("roomType").addEventListener("change", updateCreatePasswordVisibility);

document.getElementById("roomPassword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    createRoom();
  }
});

document.getElementById("roomModal").addEventListener("click", (event) => {
  if (event.target.id === "roomModal") {
    closeRoomModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRoomModal();
  }
});

socket.emit("get-active-rooms");
updateCreatePasswordVisibility();
updateDefaultRoomName();

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
