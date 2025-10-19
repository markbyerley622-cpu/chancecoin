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

const LOBBY_MAX = 100;
const MATCHES_MAX = 50;
const MATCHES_FILE = path.join(__dirname, "public/recent-winners.json");

let lobby = [];
let recentMatches = [];
let playerQueues = {}; // stake => { heads: player, tails: player }

try {
  if (fs.existsSync(MATCHES_FILE)) {
    recentMatches = JSON.parse(fs.readFileSync(MATCHES_FILE));
    console.log(`✅ Loaded ${recentMatches.length} recent matches from file.`);
  }
} catch (err) {
  console.error("⚠️ Error reading recent matches JSON:", err);
  recentMatches = [];
}

io.on("connection", (socket) => {
  console.log("✅ New client connected:", socket.id);
  
  socket.emit("lobbyUpdate", lobby);
  recentMatches.forEach(match => socket.emit("recentMatch", match));

  socket.on("playerJoined", (data) => {
    const { addr, stake, side } = data;
    console.log(`Player joined: ${addr}, stake: ${stake}, side: ${side}`);

    // Add to lobby
    lobby.unshift({ ...data, ts: Date.now(), socketId: socket.id });
    if (lobby.length > LOBBY_MAX) lobby.pop();
    io.emit("lobbyUpdate", lobby);

    // Initialize queue for this stake if needed
    if (!playerQueues[stake]) {
      playerQueues[stake] = { 1: null, 2: null };
    }

    // Check if there's an opponent waiting
    const opposite = side === 1 ? 2 : 1;
    const opponent = playerQueues[stake][opposite];

    if (opponent) {
      // MATCH FOUND!
      console.log(`🎮 Match found: ${addr} vs ${opponent.addr}`);
      
      // Clear the queue
      playerQueues[stake][opposite] = null;

      // Determine winner (50/50 random)
      const isHeads = Math.random() < 0.5;
      const winner = isHeads ? addr : opponent.addr;
      
      // Calculate payout (5% fee)
      const stakeWei = ethers.utils.parseEther(stake);
      const totalPot = stakeWei.mul(2);
      const fee = totalPot.mul(5).div(100);
      const winnerAmount = totalPot.sub(fee);

      console.log(`Winner: ${winner}, Amount: ${ethers.utils.formatEther(winnerAmount)} BNB`);

      // Send result to both players
      socket.emit("matchResult", {
        result: isHeads ? "heads" : "tails",
        winner: winner,
        opponent: opponent.addr,
        amount: winnerAmount.toString()
      });

      if (opponent.socketId) {
        io.to(opponent.socketId).emit("matchResult", {
          result: isHeads ? "heads" : "tails",
          winner: winner,
          opponent: addr,
          amount: winnerAmount.toString()
        });
      }

      // Record the match
      const match = {
        p1: addr,
        p2: opponent.addr,
        winner: winner,
        amount: ethers.utils.formatEther(winnerAmount),
        stake: stake,
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
    } else {
      // No opponent - queue this player
      playerQueues[stake][side] = {
        addr: addr,
        socketId: socket.id,
        side: side,
        joinedAt: Date.now()
      };
      console.log(`⏳ Player queued at stake ${stake}, side ${side}`);
    }
  });

  socket.on("matchResolved", (match) => {
    recentMatches.unshift(match);
    if (recentMatches.length > MATCHES_MAX) recentMatches.pop();
    
    try {
      fs.writeFileSync(MATCHES_FILE, JSON.stringify(recentMatches, null, 2));
    } catch (err) {
      console.error("⚠️ Error saving recent matches JSON:", err);
    }
    
    io.emit("recentMatch", match);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    
    // Clean up player from queues
    for (const stake in playerQueues) {
      for (const side in playerQueues[stake]) {
        if (playerQueues[stake][side] && playerQueues[stake][side].socketId === socket.id) {
          playerQueues[stake][side] = null;
        }
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));