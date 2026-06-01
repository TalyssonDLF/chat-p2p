const socket = io("http://localhost:3000");

let roomCode = "";
let username = "";

function joinRoom() {
  username = document.getElementById("username").value.trim();
  roomCode = document.getElementById("room").value.trim();

  if (!username || !roomCode) {
    alert("Preencha seu nome e o código da sala.");
    return;
  }

  socket.emit("join-room", {
    roomCode,
    username
  });

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("chatScreen").classList.remove("hidden");

  document.getElementById("roomName").textContent = roomCode;
  document.getElementById("chatTitle").textContent = `Sala ${roomCode}`;
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

socket.on("receive-message", (data) => {
  const messages = document.getElementById("messages");

  const isMine = data.username === username;

  const row = document.createElement("div");
  row.classList.add("message-row");

  if (isMine) {
    row.classList.add("mine");
  }

  const initial = data.username.charAt(0).toUpperCase();

  row.innerHTML = `
    <div class="avatar">${initial}</div>

    <div class="message-content">
      <div class="message-meta">
        <strong>${isMine ? "Você" : data.username}</strong>
        <small>${data.time || ""}</small>
      </div>

      <p>${escapeHTML(data.message)}</p>
    </div>
  `;

  messages.appendChild(row);
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

function escapeHTML(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}