// lobby.js - Real-time lobby chat and player list

// Initialize Socket.io connection
const socket = io('https://sixfigs.onrender.com');
 // Change to your production URL when deploying

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const usernameInput = document.getElementById('usernameInput');
const sendBtn = document.getElementById('sendBtn');
const playersList = document.getElementById('playersList');
const playerCount = document.getElementById('playerCount');
const connectionStatus = document.getElementById('connectionStatus');

// Store username in localStorage
let username = localStorage.getItem('lobbyUsername') || '';
if (username) {
  usernameInput.value = username;
}

// Save username when changed
usernameInput.addEventListener('change', () => {
  username = usernameInput.value.trim();
  if (username) {
    localStorage.setItem('lobbyUsername', username);
    // Notify server of username change
    socket.emit('updateUsername', username);
  }
});

// Connection status handlers
socket.on('connect', () => {
  console.log('Connected to lobby server');
  updateConnectionStatus(true);
  
  // Send username if we have one
  if (username) {
    socket.emit('joinLobby', username);
  } else {
    // Emit join with Anonymous if no username yet
    socket.emit('joinLobby', 'Anonymous');
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from lobby server');
  updateConnectionStatus(false);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  updateConnectionStatus(false);
});

// Update connection status UI
function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.textContent = '🟢 Connected to lobby';
    connectionStatus.className = 'connection-status status-connected';
  } else {
    connectionStatus.textContent = '🔴 Disconnected from lobby';
    connectionStatus.className = 'connection-status status-disconnected';
  }
}

// Receive updated players list
socket.on('playersList', (players) => {
  console.log('Updated players list:', players);
  updatePlayersList(players);
});

// Receive chat message
socket.on('chatMessage', (data) => {
  addMessage(data);
});

// Chat history cleared event
socket.on('chatHistoryCleared', () => {
  console.log('Chat history cleared by server');
  chatMessages.innerHTML = '';
  addSystemMessage('💨 Chat history refreshed');
});

// User joined notification
socket.on('userJoined', (data) => {
  console.log('User joined:', data.username);
  addSystemMessage(`${data.username} joined the lobby`);
});

// User left notification
socket.on('userLeft', (data) => {
  console.log('User left:', data.username);
  addSystemMessage(`${data.username} left the lobby`);
});

// Send message
function sendMessage() {
  const message = chatInput.value.trim();
  const user = usernameInput.value.trim() || 'Anonymous';
  
  if (message && message.length > 0) {
    // Save username if not already saved
    if (user !== 'Anonymous' && user !== username) {
      username = user;
      localStorage.setItem('lobbyUsername', username);
    }
    
    // Emit chat message to server
    socket.emit('chatMessage', {
      username: user,
      message: message,
      timestamp: Date.now()
    });
    
    // Clear input
    chatInput.value = '';
  }
}

// Send message on button click
sendBtn.addEventListener('click', sendMessage);

// Send message on Enter key
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Update username on Enter key
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    username = usernameInput.value.trim();
    if (username) {
      localStorage.setItem('lobbyUsername', username);
      socket.emit('updateUsername', username);
      chatInput.focus();
    }
  }
});

// Add message to chat
function addMessage(data) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message message-user';
  
  const timestamp = new Date(data.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <span class="message-username">${escapeHtml(data.username)}</span>
      <span class="message-time">${timestamp}</span>
    </div>
    <div class="message-content">${escapeHtml(data.message)}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Add system message
function addSystemMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message message-system';
  messageDiv.textContent = text;
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

// Update players list
function updatePlayersList(players) {
  playersList.innerHTML = '';
  
  if (!players || players.length === 0) {
    playerCount.textContent = '0 players';
    return;
  }
  
  playerCount.textContent = `${players.length} ${players.length === 1 ? 'player' : 'players'}`;
  
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    
    // Get first letter for avatar
    const initial = player.username ? player.username[0].toUpperCase() : '?';
    
    playerDiv.innerHTML = `
      <div class="player-avatar">${initial}</div>
      <div class="player-name">${escapeHtml(player.username)}</div>
    `;
    
    playersList.appendChild(playerDiv);
  });
}

// Scroll chat to bottom
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Join lobby when username is provided
usernameInput.addEventListener('blur', () => {
  const user = usernameInput.value.trim();
  if (user && user !== username) {
    username = user;
    localStorage.setItem('lobbyUsername', username);
    socket.emit('updateUsername', username);
  }
});

// Initial join if we have a username
if (username) {
  socket.emit('joinLobby', username);
}