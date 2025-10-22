const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const ethers = require("ethers");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://chancecoin.fun", "https://sixfigs.onrender.com"],
    methods: ["GET", "POST"]
  }
});

app.use(express.static("public"));

// BSC Mainnet RPC - Free public endpoint
const PROVIDER_URL = "https://bsc-dataseed1.binance.org/";
const CHANCE_CONTRACT_ADDRESS = "0x5BecFfDd41ab85Bf5687e0B4e6DE1175A7fD9EB8";

const chanceAbi = [
  "event MatchSettled(uint256 indexed matchId, address winner, uint256 amount)",
  "event PlayerQueued(address indexed player, uint256 stake, uint8 side)",
  "event MatchCreated(uint256 indexed matchId, address p1, address p2, uint256 stake)",
  "function matches(uint256) view returns (uint256 id, address p1Addr, uint256 p1Stake, uint8 p1Side, address p2Addr, uint256 p2Stake, uint8 p2Side, uint256 stake, bool settled)"
];

let provider;
let contract;
let isConnected = false;

const LOBBY_MAX = 100;
const MATCHES_MAX = 50;
const MATCHES_FILE = path.join(__dirname, "public/recent-winners.json");
const CHAT_REFRESH_INTERVAL = 30 * 60 * 1000;

let lobby = [];
let recentMatches = [];
let connectedPlayers = {}; // address => {socketId, side}
let pendingMatches = {}; // matchId => {p1, p2, p1Side, p2Side, stake}

// === LOBBY CHAT DATA ===
let lobbyPlayers = new Map();
const CHAT_HISTORY_LIMIT = 100;
let chatHistory = [];

// Load recent matches from file
try {
  if (fs.existsSync(MATCHES_FILE)) {
    recentMatches = JSON.parse(fs.readFileSync(MATCHES_FILE));
    console.log(`✅ Loaded ${recentMatches.length} recent matches from file.`);
  }
} catch (err) {
  console.error("⚠️ Error reading recent matches JSON:", err);
  recentMatches = [];
}

// Initialize blockchain connection
async function initBlockchain() {
  try {
    console.log("🔗 Connecting to BSC Mainnet...");
    provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
    
    const network = await provider.getNetwork();
    console.log(`✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    contract = new ethers.Contract(CHANCE_CONTRACT_ADDRESS, chanceAbi, provider);
    console.log(`📡 Listening to contract: ${CHANCE_CONTRACT_ADDRESS}`);
    
    isConnected = true;
    setupEventListeners();
  } catch (err) {
    console.error("❌ Failed to connect to blockchain:", err);
    console.log("⚠️ Server will continue without blockchain events");
    isConnected = false;
  }
}

function setupEventListeners() {
  if (!contract) return;

  // Listen for PlayerQueued events
  contract.on("PlayerQueued", (player, stake, side, event) => {
    console.log(`⏳ PlayerQueued: ${player}, stake: ${ethers.utils.formatEther(stake)} BNB, side: ${side === 1 ? 'TAILS' : 'HEADS'} (${side})`);
  });

  // Listen for MatchCreated events
  contract.on("MatchCreated", async (matchId, p1, p2, stake, event) => {
    console.log(`\n🎮 MatchCreated Event:`);
    console.log(`   Match ID: ${matchId}`);
    console.log(`   Player 1: ${p1}`);
    console.log(`   Player 2: ${p2}`);
    console.log(`   Stake: ${ethers.utils.formatEther(stake)} BNB`);
    
    // Get player sides from connectedPlayers
    const p1Data = connectedPlayers[p1.toLowerCase()];
    const p2Data = connectedPlayers[p2.toLowerCase()];
    
    const p1Side = p1Data ? p1Data.side : null;
    const p2Side = p2Data ? p2Data.side : null;
    
    console.log(`   P1 Side: ${p1Side === 1 ? 'TAILS' : p1Side === 2 ? 'HEADS' : 'UNKNOWN'} (${p1Side})`);
    console.log(`   P2 Side: ${p2Side === 1 ? 'TAILS' : p2Side === 2 ? 'HEADS' : 'UNKNOWN'} (${p2Side})`);
    
    pendingMatches[matchId.toString()] = {
      p1: p1,
      p2: p2,
      p1Side: p1Side,
      p2Side: p2Side,
      stake: stake,
      timestamp: Date.now()
    };
    
    const match = {
      matchId: matchId.toString(),
      p1: p1,
      p2: p2,
      stake: ethers.utils.formatEther(stake),
      ts: Date.now()
    };
    
    lobby.unshift(match);
    if (lobby.length > LOBBY_MAX) lobby.pop();
    io.emit("lobbyUpdate", lobby);
  });

  // Listen for MatchSettled events
  contract.on("MatchSettled", async (matchId, winner, amount, event) => {
    console.log(`\n🏆 MatchSettled Event:`);
    console.log(`   Match ID: ${matchId}`);
    console.log(`   Winner: ${winner}`);
    console.log(`   Amount: ${ethers.utils.formatEther(amount)} BNB`);
    
    try {
      const pending = pendingMatches[matchId.toString()];
      
      if (!pending) {
        console.log("⚠️ No pending match found in memory");
        return;
      }
      
      const p1 = pending.p1;
      const p2 = pending.p2;
      const p1Side = pending.p1Side;
      const p2Side = pending.p2Side;
      
      console.log(`   Player 1: ${p1} (side: ${p1Side})`);
      console.log(`   Player 2: ${p2} (side: ${p2Side})`);
      
      const winnerLower = winner.toLowerCase();
      const p1Lower = p1.toLowerCase();
      const p2Lower = p2.toLowerCase();
      
      console.log(`   Winner is P1: ${winnerLower === p1Lower}`);
      console.log(`   Winner is P2: ${winnerLower === p2Lower}`);
      
      // Get socket IDs
      const p1Data = connectedPlayers[p1Lower];
      const p2Data = connectedPlayers[p2Lower];
      
      const player1SocketId = p1Data ? p1Data.socketId : null;
      const player2SocketId = p2Data ? p2Data.socketId : null;
      
      console.log(`   P1 Socket: ${player1SocketId || 'NOT CONNECTED'}`);
      console.log(`   P2 Socket: ${player2SocketId || 'NOT CONNECTED'}`);
      
      // Send results to both players
      if (player1SocketId) {
        const resultData = {
          winner: winner,
          opponent: p2,
          amount: amount.toString()
        };
        console.log(`   📤 Sending to P1:`, resultData);
        io.to(player1SocketId).emit("matchResult", resultData);
      } else {
        console.log(`   ⚠️ P1 not connected via socket`);
      }
      
      if (player2SocketId) {
        const resultData = {
          winner: winner,
          opponent: p1,
          amount: amount.toString()
        };
        console.log(`   📤 Sending to P2:`, resultData);
        io.to(player2SocketId).emit("matchResult", resultData);
      } else {
        console.log(`   ⚠️ P2 not connected via socket`);
      }
      
      // Save match
      const match = {
        matchId: matchId.toString(),
        p1: p1,
        p2: p2,
        winner: winner,
        amount: ethers.utils.formatEther(amount),
        stake: ethers.utils.formatEther(pending.stake),
        p1Side: p1Side,
        p2Side: p2Side,
        ts: Date.now()
      };
      
      recentMatches.unshift(match);
      if (recentMatches.length > MATCHES_MAX) recentMatches.pop();
      
      try {
        fs.writeFileSync(MATCHES_FILE, JSON.stringify(recentMatches, null, 2));
      } catch (err) {
        console.error("⚠️ Error saving matches:", err);
      }
      
      io.emit("recentMatch", match);
      delete pendingMatches[matchId.toString()];
      
      console.log(`   ✅ Match processing complete\n`);
      
    } catch (err) {
      console.error("❌ Error processing MatchSettled event:", err);
    }
  });

  console.log("✅ Event listeners set up successfully");
}

// === Helper Functions for Lobby Chat ===
function sanitizeUsername(username) {
  if (!username || typeof username !== 'string') return 'Anonymous';
  return username.replace(/[<>]/g, '').trim().substring(0, 30) || 'Anonymous';
}

function sanitizeMessage(message) {
  if (!message || typeof message !== 'string') return '';
  return message.replace(/[<>]/g, '').trim().substring(0, 500);
}

function getLobbyPlayersList() {
  return Array.from(lobbyPlayers.values()).map(player => ({
    id: player.id,
    username: player.username
  }));
}

function setupChatRefresh() {
  setInterval(() => {
    console.log('🧹 Clearing chat history (30-minute refresh)');
    chatHistory = [];
    io.emit('chatHistoryCleared');
  }, CHAT_REFRESH_INTERVAL);
}

// === Socket.IO Connection Handler ===
io.on("connection", (socket) => {
  console.log("\n✅ New client connected:", socket.id);
  
  socket.emit("lobbyUpdate", lobby);
  recentMatches.forEach(match => socket.emit("recentMatch", match));

  // === GAME LOGIC ===
  socket.on("playerJoined", (data) => {
    const { addr, stake, side } = data;
    const addrLower = addr.toLowerCase();
    
    console.log(`\n🎮 playerJoined event received:`);
    console.log(`   Address: ${addr}`);
    console.log(`   Stake: ${stake} BNB`);
    console.log(`   Side: ${side === 1 ? 'TAILS' : 'HEADS'} (${side})`);
    console.log(`   Socket ID: ${socket.id}`);
    
    // Store player info with their side
    connectedPlayers[addrLower] = {
      socketId: socket.id,
      side: side,
      stake: stake
    };
    
    console.log(`   📝 Stored in connectedPlayers:`, connectedPlayers[addrLower]);
    console.log(`   Total connected players: ${Object.keys(connectedPlayers).length}`);
    
    lobby.unshift({ ...data, ts: Date.now(), socketId: socket.id });
    if (lobby.length > LOBBY_MAX) lobby.pop();
    io.emit("lobbyUpdate", lobby);
  });

  // === LOBBY CHAT LOGIC ===
  socket.on('joinLobby', (username) => {
    const sanitized = sanitizeUsername(username);
    
    lobbyPlayers.set(socket.id, {
      id: socket.id,
      username: sanitized,
      connectedAt: Date.now()
    });
    
    console.log(`💬 ${sanitized} joined the lobby (${socket.id})`);
    
    io.emit('userJoined', { username: sanitized });
    
    const playersList = getLobbyPlayersList();
    io.emit('playersList', playersList);
    
    chatHistory.forEach(msg => {
      socket.emit('chatMessage', msg);
    });
  });

  socket.on('updateUsername', (username) => {
    const sanitized = sanitizeUsername(username);
    if (lobbyPlayers.has(socket.id)) {
      const oldUsername = lobbyPlayers.get(socket.id).username;
      lobbyPlayers.set(socket.id, {
        id: socket.id,
        username: sanitized,
        connectedAt: lobbyPlayers.get(socket.id).connectedAt
      });
      
      console.log(`📝 ${oldUsername} changed name to ${sanitized}`);
      
      const playersList = getLobbyPlayersList();
      io.emit('playersList', playersList);
    }
  });

  socket.on('chatMessage', (data) => {
    const sanitizedMessage = sanitizeMessage(data.message);
    const sanitizedUsername = sanitizeUsername(data.username);
    
    if (!sanitizedMessage) return;
    
    const chatMsg = {
      username: sanitizedUsername,
      message: sanitizedMessage,
      timestamp: data.timestamp || Date.now()
    };
    
    console.log(`💬 [${sanitizedUsername}]: ${sanitizedMessage}`);
    
    chatHistory.push(chatMsg);
    if (chatHistory.length > CHAT_HISTORY_LIMIT) {
      chatHistory.shift();
    }
    
    socket.broadcast.emit('chatMessage', chatMsg);
    socket.emit('chatMessage', { ...chatMsg, confirmed: true });
  });

  // === DISCONNECT HANDLER ===
  socket.on("disconnect", () => {
    console.log("\n❌ Client disconnected:", socket.id);
    
    for (const addr in connectedPlayers) {
      if (connectedPlayers[addr].socketId === socket.id) {
        console.log(`   🗑️ Removed ${addr} from connected players`);
        delete connectedPlayers[addr];
      }
    }
    
    const player = lobbyPlayers.get(socket.id);
    if (player) {
      lobbyPlayers.delete(socket.id);
      console.log(`   💬 ${player.username} left the lobby`);
      
      io.emit('userLeft', { username: player.username });
      
      const playersList = getLobbyPlayersList();
      io.emit('playersList', playersList);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Network: BSC Mainnet`);
  console.log(`💬 Lobby chat enabled`);
  console.log(`🧹 Chat history refreshes every 30 minutes`);
  initBlockchain();
  setupChatRefresh();
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (contract) {
    contract.removeAllListeners();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});