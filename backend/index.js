import express from 'express'
import ConnectDB from './config/ConnectDB.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import router from './routes/authRoute.js'
import chatRoute from './routes/chatRoute.js'
import statusRoute from './routes/statusRoute.js'
import initializeSocket from './services/socketService.js'
import http from 'http'
import path from 'path'

dotenv.config()

//* ===== Basic Setup =====>
const port = process.env.PORT || 8000
const app = express()

//* Fix for ES Module __dirname
const __dirname = path.resolve()

//* Required for Render / production proxies
app.set("trust proxy", 1)


//* ===== CORS Configuration =====>
const corsOptions = {
    origin: process.env.FRONTEND_URL,  //* Must match deployed frontend URL
    credentials: true,                //* Allow cookies
    methods: ["GET", "POST", "PUT", "DELETE"],
}


//* ===== Middlewares =====>
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())


//* ===== Socket Setup =====>
const server = http.createServer(app)
const io = initializeSocket(server)


//* ==== Middleware to attach Socket.IO instance and related maps to req object for API routes ====>
app.use((req, res, next) => {
    req.io = io
    req.socketUserMap = io.userConnections || new Map()
    req.activeChatWindows = io.activeChatWindows || new Map()
    next()
})


//* ===== API Routes =====>
app.use('/api/auth', router)
app.use('/api/chat', chatRoute)
app.use('/api/status', statusRoute)


//* ===== Production Frontend Serving =====>
if (process.env.NODE_ENV === "production") {

    //& Serve static frontend build files
    app.use(express.static(path.join(__dirname, "frontend", "dist")))

    //& For React/Vite routing (SPA support)
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"))
    })
} else {
    //& Development mode route
    app.get('/', (req, res) => {
        res.send("🚀 API running in development mode")
    })
}


//* ===== Connect DB & Start Server =====>
ConnectDB()
    .then(() => {
        server.listen(port, () => {
            console.log(`✅ Server started at --> http://localhost:${port}`)
        })
    })
    .catch((err) => {
        console.error("❌ DB connection failed", err)
        process.exit(1) //& Exit if DB fails (production standard)
    })