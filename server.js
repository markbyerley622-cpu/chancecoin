const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const ethers = require("ethers");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// BSC Mainnet RPC - Free public endpoint (or get your own from https://www.ankr.com or https://chainlist.org)
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

let lobby = [];
let recentMatches = [];
let connectedPlayers = {}; // address => socketId
let pendingMatches = {}; // matchId => {p1, p2, p1Side, p2Side}

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
    
    // Test connection
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

  // Listen for MatchCreated events
  contract.on("MatchCreated", (matchId, p1, p2, stake, event) => {
    console.log(`🎮 MatchCreated: Match #${matchId}, ${p1} vs ${p2}, stake: ${ethers.utils.formatEther(stake)} BNB`);
    
    // We need to wait for MatchSettled to know the sides, so store the match temporarily
    pendingMatches[matchId.toString()] = {
      p1: p1,
      p2: p2,
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

  // Listen for MatchSettled events - THIS IS THE KEY EVENT
  contract.on("MatchSettled", async (matchId, winner, amount, event) => {
    console.log(`🏆 MatchSettled: Match #${matchId}, Winner: ${winner}, Amount: ${ethers.utils.formatEther(amount)} BNB`);
    
    try {
      // Get the pending match info
      const pending = pendingMatches[matchId.toString()];
      
      if (!pending) {
        console.log("⚠️ No pending match found, will query blockchain");
      }
      
      const p1 = pending ? pending.p1 : null;
      const p2 = pending ? pending.p2 : null;
      
      // Determine opponent for each player
      let p1Opponent = p2;
      let p2Opponent = p1;
      
      // If we don't have pending data, try to get it from recent PlayerQueued events
      if (!p1 || !p2) {
        console.log("⚠️ Missing player info for match", matchId.toString());
      }
      
      // Send results to both players
      const player1SocketId = p1 ? connectedPlayers[p1.toLowerCase()] : null;
      const player2SocketId = p2 ? connectedPlayers[p2.toLowerCase()] : null;
      
      if (player1SocketId) {
        io.to(player1SocketId).emit("matchResult", {
          winner: winner,
          opponent: p1Opponent || "Unknown",
          amount: amount.toString()
        });
        console.log(`✅ Sent result to P1 (${p1})`);
      } else {
        console.log(`⚠️ P1 not connected via socket`);
      }
      
      if (player2SocketId) {
        io.to(player2SocketId).emit("matchResult", {
          winner: winner,
          opponent: p2Opponent || "Unknown",
          amount: amount.toString()
        });
        console.log(`✅ Sent result to P2 (${p2})`);
      } else {
        console.log(`⚠️ P2 not connected via socket`);
      }
      
      // Record the match
      const match = {
        matchId: matchId.toString(),
        p1: p1 || "Unknown",
        p2: p2 || "Unknown",
        winner: winner,
        amount: ethers.utils.formatEther(amount),
        stake: pending ? ethers.utils.formatEther(pending.stake) : "Unknown",
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
      
      // Clean up pending match
      delete pendingMatches[matchId.toString()];
      
    } catch (err) {
      console.error("❌ Error processing MatchSettled event:", err);
    }
  });

  // Listen for PlayerQueued events
  contract.on("PlayerQueued", (player, stake, side, event) => {
    console.log(`⏳ PlayerQueued: ${player}, stake: ${ethers.utils.formatEther(stake)} BNB, side: ${side}`);
  });

  console.log("✅ Event listeners set up successfully");
}

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);
  
  socket.emit("lobbyUpdate", lobby);
  recentMatches.forEach(match => socket.emit("recentMatch", match));

  socket.on("playerJoined", (data) => {
    const { addr, stake, side } = data;
    console.log(`🎮 Player registered: ${addr}, stake: ${stake}, side: ${side === 1 ? 'TAILS' : 'HEADS'}`);
    
    // Store player's socket connection
    connectedPlayers[addr.toLowerCase()] = socket.id;
    console.log(`📝 Stored socket for ${addr.toLowerCase()}`);
    
    // The smart contract handles matchmaking, we just track the player
    lobby.unshift({ ...data, ts: Date.now(), socketId: socket.id });
    if (lobby.length > LOBBY_MAX) lobby.pop();
    io.emit("lobbyUpdate", lobby);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    
    // Clean up player from connected players
    for (const addr in connectedPlayers) {
      if (connectedPlayers[addr] === socket.id) {
        delete connectedPlayers[addr];
        console.log(`🗑️ Removed ${addr} from connected players`);
      }
    }
  });
});

// Start server and initialize blockchain
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Network: BSC Mainnet`);
  initBlockchain();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (contract) {
    contract.removeAllListeners();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});//localhost:${PORT}`));