import express from "express";
import ConnectDB from "./config/ConnectDB.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import router from "./routes/authRoute.js";
import chatRoute from "./routes/chatRoute.js";
import statusRoute from "./routes/statusRoute.js";
import initializeSocket from "./services/socketService.js";
import http from "http";
import path from "path";

dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ IMPORTANT: Use Render's PORT
const PORT = process.env.PORT || 8000;

// ✅ Fix __dirname for ES Modules
const __dirname = path.resolve();

// ✅ Required for Render proxy
app.set("trust proxy", 1);

// ================= CORS =================
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// ================= SOCKET.IO =================
const io = initializeSocket(server);

app.use((req, res, next) => {
  req.io = io;
  req.socketUserMap = io.userConnections || new Map();
  req.activeChatWindows = io.activeChatWindows || new Map();
  next();
});

// ================= API ROUTES =================
app.use("/api/auth", router);
app.use("/api/chat", chatRoute);
app.use("/api/status", statusRoute);

// ================= PRODUCTION FRONTEND =================
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "frontend", "dist")));

  // ✅ EXPRESS 5 SAFE CATCH-ALL (NO MORE '*')
  app.use((req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("🚀 API running in development mode");
  });
}

// ================= START SERVER =================
ConnectDB()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  });