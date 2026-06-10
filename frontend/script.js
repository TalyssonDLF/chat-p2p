const socket = io("https://chat-p2p-v9l6.onrender.com");

const DEMO_MODE = true;
const ROOM_TYPES = {
  PUBLIC: "public",
  PRIVATE: "private"
};
const RSA_KEY_SIZE = 2048;
const AES_KEY_SIZE = 256;
const KEY_PREVIEW_SIZE = 14;

const LOG_STYLES = {
  success: "color: #16a34a; font-weight: 700;",
  info: "color: #2563eb; font-weight: 700;",
  encrypted: "color: #dc2626; font-weight: 700;",
  security: "color: #ca8a04; font-weight: 700;",
  neutral: "color: inherit;"
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
// Estado criptográfico mantido somente no navegador de cada participante.
let rsaKeyPair = null;
let exportedPublicKey = "";
let publicKeysByUserId = new Map();
let aesSessionsByUserId = new Map();

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

async function enterChat(room) {
  const messages = document.getElementById("messages");

  messages.innerHTML = "";
  historyRenderedForCurrentRoom = false;
  roomCode = room.roomCode;
  roomName = room.roomName || room.name || room.roomCode;
  roomType = room.roomType || room.type || ROOM_TYPES.PUBLIC;
  pendingPrivateRoomCode = null;

  resetSecurityState();

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("chatScreen").classList.remove("hidden");

  updateRoomLabels();
  closeRoomModal();
  await initializeRoomSecurity();
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
  resetSecurityState();

  document.getElementById("messages").innerHTML = "";
  document.getElementById("messageInput").value = "";
  document.getElementById("chatScreen").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  renderUsers();
  closeRoomModal();
  socket.emit("get-active-rooms");
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message || !roomCode) return;

  const recipients = currentUsers.filter((user) => user.id !== socket.id);

  if (recipients.length === 0) {
    renderMessage({ username, message, time: getLocalFormattedTime() });
    input.value = "";
    input.focus();
    return;
  }

  try {
    const encryptedMessages = await Promise.all(
      recipients.map(async (recipient) => {
        const session = aesSessionsByUserId.get(recipient.id);

        if (!session) {
          throw new Error(`Chave AES ainda não negociada com ${recipient.username}. Aguarde alguns segundos.`);
        }

        const encryptedPayload = await encryptMessageForSession(message, session.key);
        const signature = await signMessage(message);

        return {
          recipientId: recipient.id,
          encryptedMessage: encryptedPayload.encryptedMessage,
          iv: encryptedPayload.iv,
          signature
        };
      })
    );

    logMessageSend(message, encryptedMessages[0]);

    socket.emit("send-message", {
      roomCode,
      encryptedMessages
    });

    renderMessage({ username, message, time: getLocalFormattedTime() });
    input.value = "";
    input.focus();
  } catch (error) {
    console.error("Não foi possível criptografar a mensagem:", error);
    renderSystemMessage(error.message || "Não foi possível criptografar a mensagem.");
  }
}

function renderHistory(history = []) {
  const messages = document.getElementById("messages");

  if (historyRenderedForCurrentRoom) return;

  messages.innerHTML = "";
  history.forEach((message) => {
    if (message.message) {
      renderMessage(message);
    }
  });
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

      <div class="private-join ${showPasswordInput ? "" : "hidden"}">
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

function getLocalFormattedTime() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function resetSecurityState() {
  rsaKeyPair = null;
  exportedPublicKey = "";
  publicKeysByUserId = new Map();
  aesSessionsByUserId = new Map();
}

async function initializeRoomSecurity() {
  // Fluxo automático da demonstração: gerar RSA localmente e anunciar a chave pública ao entrar.
  if (!window.crypto?.subtle) {
    renderSystemMessage("Este navegador não oferece Web Crypto API para a demonstração segura.");
    return;
  }

  logSecurityInitializationStart();

  rsaKeyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: RSA_KEY_SIZE,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );

  exportedPublicKey = await exportPublicKey(rsaKeyPair.publicKey);
  logSecurityInitializationComplete();
  logPublicKeySent(exportedPublicKey);

  socket.emit("public-key", {
    roomCode,
    publicKey: exportedPublicKey
  });
}

async function handlePublicKeyReceived({ userId, username: keyOwner, publicKey }) {
  if (!userId || userId === socket.id || !publicKey || !roomCode) return;

  publicKeysByUserId.set(userId, publicKey);
  logPublicKeyReceived(publicKey);

  if (socket.id > userId && !aesSessionsByUserId.has(userId)) {
    await createAndSendSessionKey(userId, keyOwner, publicKey);
  }
}

async function createAndSendSessionKey(recipientId, recipientName, recipientPublicKey) {
  // Apenas um lado do par cria a AES; ela trafega criptografada com RSA-OAEP do destinatário.
  const aesKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: AES_KEY_SIZE
    },
    true,
    ["encrypt", "decrypt"]
  );
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyHex = arrayBufferToHex(rawAesKey);
  const importedPublicKey = await importPublicKey(recipientPublicKey);
  const encryptedAesKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    importedPublicKey,
    rawAesKey
  );
  const encryptedAesKeyBase64 = arrayBufferToBase64(encryptedAesKey);

  aesSessionsByUserId.set(recipientId, { key: aesKey, hex: aesKeyHex });
  logAesGenerated(aesKeyHex);
  logRsaEncryption(aesKeyHex, encryptedAesKeyBase64);

  socket.emit("encrypted-aes-key", {
    roomCode,
    recipientId,
    encryptedAesKey: encryptedAesKeyBase64
  });

  if (recipientName) {
    demoLog(`Chave AES de sessão enviada para ${recipientName}.`, "success");
  }
}

async function handleEncryptedAesKey({ senderId, encryptedAesKey }) {
  if (!senderId || senderId === socket.id || !encryptedAesKey || !rsaKeyPair) return;

  const encryptedKeyBuffer = base64ToArrayBuffer(encryptedAesKey);
  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaKeyPair.privateKey,
    encryptedKeyBuffer
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
  const aesKeyHex = arrayBufferToHex(rawAesKey);

  aesSessionsByUserId.set(senderId, { key: aesKey, hex: aesKeyHex });
  logRsaDecryption(encryptedAesKey, aesKeyHex);
}

async function encryptMessageForSession(message, aesKey) {
  // AES-GCM garante confidencialidade e autenticação do ciphertext de cada destinatário.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    aesKey,
    new TextEncoder().encode(message)
  );

  return {
    encryptedMessage: arrayBufferToHex(encryptedBuffer),
    iv: arrayBufferToBase64(iv)
  };
}

async function decryptIncomingMessage(data) {
  const session = aesSessionsByUserId.get(data.senderId);

  if (!session) {
    throw new Error("Chave AES de sessão não encontrada para o remetente.");
  }

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToArrayBuffer(data.iv)
    },
    session.key,
    hexToArrayBuffer(data.encryptedMessage)
  );

  return new TextDecoder().decode(decryptedBuffer);
}

async function signMessage(message) {
  const signingKeyPair = await getSigningKeyPair();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  const signature = await crypto.subtle.sign(
    {
      name: "RSA-PSS",
      saltLength: 32
    },
    signingKeyPair.privateKey,
    hash
  );

  return arrayBufferToBase64(signature);
}

async function verifyMessageSignature(message, signature, senderId) {
  const senderPublicKey = publicKeysByUserId.get(senderId);

  if (!senderPublicKey || !signature) return false;

  const publicKey = await importSigningPublicKey(senderPublicKey);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));

  return crypto.subtle.verify(
    {
      name: "RSA-PSS",
      saltLength: 32
    },
    publicKey,
    base64ToArrayBuffer(signature),
    hash
  );
}

async function getSigningKeyPair() {
  // A demonstração usa um par RSA-OAEP para sigilo e deriva uma chave RSA-PSS
  // exportável equivalente a partir do mesmo material público/privado para mostrar autenticidade.
  const privateJwk = await crypto.subtle.exportKey("jwk", rsaKeyPair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", rsaKeyPair.publicKey);

  return {
    privateKey: await crypto.subtle.importKey(
      "jwk",
      { ...privateJwk, alg: "PS256", key_ops: ["sign"] },
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["sign"]
    ),
    publicKey: await crypto.subtle.importKey(
      "jwk",
      { ...publicJwk, alg: "PS256", key_ops: ["verify"] },
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["verify"]
    )
  };
}

async function exportPublicKey(publicKey) {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(spki);
}

async function importPublicKey(publicKeyBase64) {
  return crypto.subtle.importKey(
    "spki",
    base64ToArrayBuffer(publicKeyBase64),
    {
      name: "RSA-OAEP",
      hash: "SHA-256"
    },
    true,
    ["encrypt"]
  );
}

async function importSigningPublicKey(publicKeyBase64) {
  const publicJwk = await crypto.subtle.exportKey("jwk", await importPublicKey(publicKeyBase64));

  return crypto.subtle.importKey(
    "jwk",
    { ...publicJwk, alg: "PS256", key_ops: ["verify"] },
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }

  return bytes.buffer;
}

function preview(value, size = KEY_PREVIEW_SIZE) {
  return `${String(value || "").slice(0, size)}...`;
}

function demoLog(message, style = "info") {
  if (!DEMO_MODE) return;
  console.log(`%c${message}`, LOG_STYLES[style] || LOG_STYLES.info);
}

function logSecurityInitializationStart() {
  demoLog("=================================================\n🔐 INICIALIZAÇÃO DE SEGURANÇA\n=============================\n\nGerando par de chaves RSA...", "security");
}

function logSecurityInitializationComplete() {
  demoLog("✓ Chave pública criada", "success");
  demoLog("✓ Chave privada criada", "success");
}

function logPublicKeySent(publicKey) {
  demoLog("=================================================\n📤 TROCA DE CHAVES\n==================", "security");
  demoLog("✓ Chave pública enviada", "success");
  demoLog(`PUBLIC KEY:\n${preview(publicKey)}`, "info");
}

function logPublicKeyReceived(publicKey) {
  demoLog("=================================================\n📤 TROCA DE CHAVES\n==================", "security");
  demoLog("✓ Chave pública recebida", "success");
  demoLog(`PUBLIC KEY:\n${preview(publicKey)}`, "info");
}

function logAesGenerated(aesKeyHex) {
  demoLog("=================================================\n🔑 CHAVE DE SESSÃO\n==================", "security");
  demoLog(`AES gerada:\n${preview(aesKeyHex)}`, "info");
}

function logRsaEncryption(aesKeyHex, encryptedAesKey) {
  demoLog("=================================================\n🔒 RSA\n======", "security");
  demoLog(`AES original:\n${preview(aesKeyHex)}`, "info");
  demoLog(`AES criptografada:\n${preview(encryptedAesKey)}`, "encrypted");
}

function logRsaDecryption(encryptedAesKey, aesKeyHex) {
  demoLog("=================================================\n🔓 RSA\n======", "security");
  demoLog(`AES recebida:\n${preview(encryptedAesKey)}`, "encrypted");
  demoLog(`AES recuperada:\n${preview(aesKeyHex)}`, "info");
}

function logMessageSend(originalMessage, encryptedPayload) {
  demoLog("=================================================\n📨 ENVIO\n========", "security");
  demoLog(`Mensagem original:\n${originalMessage}`, "info");
  demoLog(`Mensagem criptografada:\n${preview(encryptedPayload.encryptedMessage, 26)}`, "encrypted");
  demoLog("Payload enviado:", "info");
  demoLog(JSON.stringify({ encryptedMessage: preview(encryptedPayload.encryptedMessage, 26) }, null, 2), "encrypted");
}

function logMessageReceive(data, decryptedMessage, isSignatureValid) {
  demoLog("=================================================\n📩 RECEBIMENTO\n==============", "security");
  demoLog(`Payload recebido:\n${preview(data.encryptedMessage, 26)}`, "encrypted");
  demoLog(`Mensagem descriptografada:\n${decryptedMessage}`, "info");
  demoLog(isSignatureValid ? "✓ Assinatura válida" : "✗ Assinatura inválida", isSignatureValid ? "success" : "encrypted");
}

socket.on("active-rooms-update", (rooms) => {
  activeRooms = Array.isArray(rooms) ? rooms : [];

  if (pendingPrivateRoomCode && !activeRooms.some((room) => room.roomCode === pendingPrivateRoomCode)) {
    pendingPrivateRoomCode = null;
  }

  renderActiveRooms();
});

socket.on("join-success", async (data) => {
  isLeavingRoom = false;
  hideLoginError();
  await enterChat(data);

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

socket.on("receive-message", async (data) => {
  const messages = document.getElementById("messages");

  if (data.encryptedMessage) {
    try {
      const decryptedMessage = await decryptIncomingMessage(data);
      const isSignatureValid = await verifyMessageSignature(decryptedMessage, data.signature, data.senderId);

      logMessageReceive(data, decryptedMessage, isSignatureValid);
      renderMessage({
        username: data.username,
        message: decryptedMessage,
        time: data.time
      });
    } catch (error) {
      console.error("Não foi possível descriptografar a mensagem:", error);
      renderSystemMessage("Mensagem criptografada recebida, mas não foi possível descriptografar.");
    }
  } else {
    renderMessage(data);
  }

  messages.scrollTop = messages.scrollHeight;
});

socket.on("public-key", (data) => {
  handlePublicKeyReceived(data).catch((error) => {
    console.error("Falha na troca de chave pública:", error);
  });
});

socket.on("existing-public-keys", (keys = []) => {
  keys.forEach((keyData) => {
    handlePublicKeyReceived(keyData).catch((error) => {
      console.error("Falha ao processar chave pública existente:", error);
    });
  });
});

socket.on("encrypted-aes-key", (data) => {
  handleEncryptedAesKey(data).catch((error) => {
    console.error("Falha ao descriptografar chave AES:", error);
  });
});

socket.on("system-message", (data) => {
  renderSystemMessage(data.message);
});

socket.on("users-update", (users) => {
  currentUsers = Array.isArray(users) ? users : [];
  const onlineUserIds = new Set(currentUsers.map((user) => user.id));

  publicKeysByUserId.forEach((_, userId) => {
    if (!onlineUserIds.has(userId)) {
      publicKeysByUserId.delete(userId);
      aesSessionsByUserId.delete(userId);
    }
  });

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
