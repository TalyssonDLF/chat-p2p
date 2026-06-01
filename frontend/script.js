const socket = io("https://chat-p2p-v9l6.onrender.com");

let roomCode = "";
let username = "";

function joinRoom() {
  username = document.getElementById("username").value.trim();
  roomCode = document.getElementById("room").value.trim();
  const password = document.getElementById("roomPassword").value;

  hideLoginError();

  if (!username || !roomCode || !password) {
    showLoginError("Preencha seu nome, o código da sala e a senha.");
    return;
  }

  socket.emit("join-room", {
    roomCode,
    username,
    password
  });
}

function enterChat(room, history = []) {
  const messages = document.getElementById("messages");

  messages.innerHTML = "";

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("chatScreen").classList.remove("hidden");

  document.getElementById("roomName").textContent = room;
  document.getElementById("chatTitle").textContent = `Sala ${room}`;

  history.forEach(renderMessage);
  messages.scrollTop = messages.scrollHeight;
  document.getElementById("messageInput").focus();
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message) return;

  socket.emit("send-message", {
    roomCode,
    username,
    message
  });

  input.value = "";
  input.focus();
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

socket.on("system-message", (data) => {
  const messages = document.getElementById("messages");

  const div = document.createElement("div");
  div.classList.add("system");
  div.textContent = data.message;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
});

socket.on("users-update", (users) => {
  const usersList = document.getElementById("usersList");

  usersList.innerHTML = "";

  users.forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user.username;
    usersList.appendChild(li);
  });
});

document.getElementById("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("room").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

document.getElementById("username").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

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
