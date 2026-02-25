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

dotenv.config();

const app = express();
const server = http.createServer(app);

// ✅ Use Render's PORT
const PORT = process.env.PORT || 8000;

// ✅ Required for Render proxy
app.set("trust proxy", 1);

// ================= CORS =================
// Use a professional environment-variable whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow Postman / curl / server-to-server requests with no origin
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin ${origin}`), false);
    },
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

// ====== DEVELOPMENT MODE ROOT ROUTE ======
if (process.env.NODE_ENV !== "production") {
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