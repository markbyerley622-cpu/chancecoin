// === FLOATING LANTERNS + PETALS BACKGROUND ===
const lanternCanvas = document.createElement("canvas");
lanternCanvas.id = "lanternCanvas";
Object.assign(lanternCanvas.style, {
  position: "fixed",
  inset: "0",
  width: "100%",
  height: "100%",
  zIndex: "-1",
  pointerEvents: "none",
});
document.body.prepend(lanternCanvas);

const ctx = lanternCanvas.getContext("2d");
let w, h;
function resizeCanvas() {
  w = lanternCanvas.width = window.innerWidth;
  h = lanternCanvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const chineseSymbols = ["福", "喜", "龙", "财", "寿", "运", "梦", "金", "光", "安"];

class Lantern {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * w;
    this.y = h + Math.random() * h;
    this.size = 25 + Math.random() * 35;
    this.speed = 0.3 + Math.random() * 0.6;
    this.phase = Math.random() * Math.PI * 2;
    this.opacity = 0.7 + Math.random() * 0.3;
    this.symbol = chineseSymbols[Math.floor(Math.random() * chineseSymbols.length)];
    this.swing = 0;
  }
  update() {
    this.y -= this.speed;
    this.swing += 0.02;
    this.x += Math.sin(this.swing + this.phase) * 0.3;
    if (this.y < -50) this.reset();
  }
  draw(ctx) {
    const grad = ctx.createLinearGradient(this.x, this.y - this.size, this.x, this.y + this.size);
    grad.addColorStop(0, "rgba(255,120,60,0.9)");
    grad.addColorStop(0.5, "rgba(255,60,0,0.8)");
    grad.addColorStop(1, "rgba(120,0,0,0.9)");
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.size * 0.6, this.size, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(255,80,40,0.7)";
    ctx.globalAlpha = this.opacity;
    ctx.fill();
    ctx.save();
    ctx.font = `${this.size * 0.9}px "Noto Serif SC", serif`;
    ctx.fillStyle = "rgba(255,240,180,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255,200,80,0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(this.symbol, this.x, this.y);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + this.size);
    ctx.lineTo(this.x, this.y + this.size * 1.3);
    ctx.strokeStyle = "rgba(255,220,150,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

const clouds = Array.from({ length: 6 }).map(() => ({
  x: Math.random() * w,
  y: Math.random() * h * 0.5,
  size: 200 + Math.random() * 200,
  speed: 0.05 + Math.random() * 0.1,
  opacity: 0.05 + Math.random() * 0.07,
}));

function drawClouds() {
  for (const c of clouds) {
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.size);
    grad.addColorStop(0, `rgba(255,230,180,${c.opacity})`);
    grad.addColorStop(1, "transparent");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
    ctx.fill();
    c.x += c.speed;
    if (c.x - c.size > w) {
      c.x = -c.size;
      c.y = Math.random() * h * 0.5;
    }
  }
}

class Petal {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * w;
    this.y = Math.random() * -h;
    this.size = 6 + Math.random() * 6;
    this.speedY = 0.5 + Math.random() * 0.5;
    this.speedX = 0.3 - Math.random() * 0.6;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = 0.02 + Math.random() * 0.03;
    this.opacity = 0.4 + Math.random() * 0.4;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.angle += this.spin;
    if (this.y > h + 20) this.reset();
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    const grad = ctx.createLinearGradient(0, 0, this.size, this.size);
    grad.addColorStop(0, `rgba(255,182,193,${this.opacity})`);
    grad.addColorStop(1, `rgba(255,105,180,${this.opacity * 0.7})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(this.size * 0.5, -this.size * 0.6, this.size, 0);
    ctx.quadraticCurveTo(this.size * 0.5, this.size * 0.6, 0, 0);
    ctx.fill();
    ctx.restore();
  }
}

const lanterns = Array.from({ length: 25 }, () => new Lantern());
const petals = Array.from({ length: 40 }, () => new Petal());

function animate() {
  ctx.clearRect(0, 0, w, h);
  drawClouds();
  lanterns.forEach(l => { l.update(); l.draw(ctx); });
  petals.forEach(p => { p.update(); p.draw(ctx); });
  requestAnimationFrame(animate);
}
animate();

window.provider = null;
window.signer = null;
window.userAddress = null;

const CHANCE_CONTRACT_ADDRESS = "0x5becffdd41ab85bf5687e0b4e6de1175a7fd9eb8";
const chanceAbi = [
  "function joinGame(uint8 side) external payable",
  "function isAllowedStake(uint256) view returns (bool)",
  "function allowedStakes(uint256) view returns (uint256)",
  "function cancelQueue(uint256 stake, uint8 side) external",
  "event MatchSettled(uint256 indexed matchId, address winner, uint256 amount)",
  "event PlayerQueued(address indexed player, uint256 stake, uint8 side)",
  "event MatchCreated(uint256 indexed matchId, address p1, address p2, uint256 stake)",
  "function feeWallet() view returns (address)",
  "function feePercentage() view returns (uint256)",
  "function getAllowedStakes() view returns (uint256[])"
];

// Custom notification system
function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.innerHTML = `
    <div class="notification-content">
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    </div>
  `;
  
  document.body.appendChild(notif);
  
  const closeBtn = notif.querySelector('.notification-close');
  closeBtn.addEventListener('click', () => notif.remove());
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notif.parentNode) notif.remove();
  }, 5000);
  
  return notif;
}

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();

  const stakeSelect = document.getElementById("stake");
  const joinGameBtn = document.getElementById("joinGameBtn");
  const lobbyList = document.getElementById("lobbyList");
  const recentList = document.getElementById("recentList");
  const coin = document.getElementById("coin");
  const connectMetaMaskBtn = document.getElementById("connectMetaMask");
  const headsBtn = document.getElementById("headsBtn");
  const tailsBtn = document.getElementById("tailsBtn");
  const addrSpan = document.getElementById("addr");

  let spinning = false;
  let userSide = null;
  let selectedStake = null;
  let spinTimeout = null;

  connectMetaMaskBtn.onclick = async () => {
    if (window.ethereum) {
      try {
        window.provider = new ethers.providers.Web3Provider(window.ethereum);
        await window.provider.send("eth_requestAccounts", []);
        window.signer = window.provider.getSigner();
        window.userAddress = await window.signer.getAddress();
        addrSpan.innerText = `✅ MetaMask: ${window.userAddress}`;

        const network = await window.provider.getNetwork();
        if (network.chainId !== 97) {
          showNotification("Please switch to BSC Testnet", 'error');
          return;
        }

        const chance = new ethers.Contract(CHANCE_CONTRACT_ADDRESS, chanceAbi, window.signer);
        const stakes = await chance.getAllowedStakes();
        const stakesFormatted = stakes.map(s => ethers.utils.formatEther(s));
        
        showNotification(`Connected! Allowed stakes: ${stakesFormatted.join(', ')} BNB`, 'success');
      } catch (err) {
        console.error(err);
        showNotification("Failed to connect: " + err.message, 'error');
      }
    } else {
      showNotification("MetaMask not found", 'error');
    }
  };

  function startSpinning() {
    spinning = true;
    coin.classList.add('flip-spinning');
    if (spinTimeout) clearTimeout(spinTimeout);
    spinTimeout = setTimeout(() => {
      spinning = false;
    }, 5000);
  }

  function flipCoin(result) {
    spinning = false;
    if (spinTimeout) clearTimeout(spinTimeout);
    coin.classList.remove('flip-spinning', 'flip-heads', 'flip-tails');
    coin.classList.add(result === "heads" ? 'flip-heads' : 'flip-tails');
  }

  function triggerConfetti() {
    const container = document.getElementById('confetti-container');
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.classList.add('confetti');
      confetti.style.left = Math.random() * window.innerWidth + 'px';
      confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
      confetti.style.animationDuration = 2 + Math.random() * 2 + 's';
      confetti.style.width = 5 + Math.random() * 10 + 'px';
      confetti.style.height = 5 + Math.random() * 10 + 'px';
      container.appendChild(confetti);
      confetti.addEventListener('animationend', () => confetti.remove());
    }
  }

  function triggerLoserX() {
    const loserCross = document.getElementById('loser-cross');
    loserCross.style.animation = 'none';
    void loserCross.offsetWidth;
    loserCross.style.animation = 'pop 0.6s ease-out forwards';
    
    setTimeout(() => {
      loserCross.style.animation = 'none';
      loserCross.style.opacity = '0';
    }, 1500);
  }

  headsBtn.disabled = true;
  tailsBtn.disabled = true;
  
  joinGameBtn.addEventListener('click', () => {
    if (!window.signer) {
      showNotification("Connect wallet first", 'error');
      return;
    }
    
    selectedStake = stakeSelect.value;
    console.log("Selected stake:", selectedStake);
    
    if (!selectedStake || selectedStake === "") {
      showNotification("Pick a stake first!", 'error');
      return;
    }
    headsBtn.disabled = false;
    tailsBtn.disabled = false;
    joinGameBtn.disabled = true;
    startSpinning();
  });

 headsBtn.onclick = () => pickSide(2);
  tailsBtn.onclick = () => pickSide(1);

  async function pickSide(side) {
    if (!window.signer) {
      showNotification("Connect wallet first", 'error');
      return;
    }
    
    if (!selectedStake) {
      showNotification("No stake selected", 'error');
      return;
    }
    userSide = side;
    headsBtn.disabled = true;
    tailsBtn.disabled = true;
    try {
      console.log("Stake value:", selectedStake);
      const stakeWei = ethers.utils.parseEther(selectedStake);
      console.log("Stake in wei:", stakeWei.toString());
      const chance = new ethers.Contract(CHANCE_CONTRACT_ADDRESS, chanceAbi, window.signer);
      const isAllowed = await chance.isAllowedStake(stakeWei);
      if (!isAllowed) {
        throw new Error(`Stake ${selectedStake} BNB is not allowed`);
      }
      showNotification("Joining game... Please confirm in MetaMask", 'info');
      const tx = await chance.joinGame(userSide, { value: stakeWei });
      showNotification("Waiting for confirmation...", 'info');
      const receipt = await tx.wait();
      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }
      console.log("Transaction confirmed:", receipt.transactionHash);
      showNotification("Successfully joined!", 'success');
      socket.emit("playerJoined", { 
        addr: window.userAddress, 
        stake: selectedStake, 
        side: userSide 
      });
      socket.once("matchResult", (data) => {
        spinning = false;
        const result = data.result;
        flipCoin(result);
        const userWon = data.winner === window.userAddress;
        const winAmount = ethers.utils.formatEther(data.amount);
        
        if (userWon) {
          showNotification(`You won! ${winAmount} BNB`, 'success');
          triggerConfetti();
        } else {
          showNotification(`You lost`, 'error');
          triggerLoserX();
        }
        
        const li = document.createElement("li");
        li.textContent = `Match: ${data.winner === window.userAddress ? 'WIN' : 'LOSS'}`;
        recentList.prepend(li);
        
        joinGameBtn.disabled = false;
        userSide = null;
        selectedStake = null;
      });
    } catch (err) {
      spinning = false;
      headsBtn.disabled = false;
      tailsBtn.disabled = false;
      joinGameBtn.disabled = false;
      console.error("Error:", err);
      showNotification("Error: " + (err.message || "Unknown error"), 'error');
      userSide = null;
      selectedStake = null;
    }
  }
});