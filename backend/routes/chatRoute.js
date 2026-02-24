//! This file is used to define all authentication-related API routes (like sending and verifying OTP)

import express from 'express'
import authMiddleware from '../middlewares/authMiddleware.js'
import { multerMiddleware } from '../config/cloudinaryConfig.js'
import { sendMessage, getConversation, getMessages, markAsRead, deleteMessage, clearChat } from '../controllers/chatController.js'


const router = express.Router()  //* Creating a new Express router instance


//^ 1️⃣. SEND MESSAGE
router.post('/send-message', authMiddleware, multerMiddleware, sendMessage) 

//^ 2️⃣. GET ALL CONVERSATIONS FOR LOGGED-IN USER
router.get('/conversations',authMiddleware, getConversation) 

//^ 3️⃣. GET MESSAGES FOR A SPECIFIC CONVERSATION
router.get('/conversations/:conversationId/messages', authMiddleware, getMessages) 

//^ 4️⃣. MARK MESSAGES AS READ
router.put('/messages/read', authMiddleware, markAsRead)

//^ 5️⃣. DELETE A SPECIFIC MESSAGE
router.delete('/messages/:messageId', authMiddleware, deleteMessage)

//^ 6️⃣. CLEAR CHAT FOR USER
router.delete('/conversations/:conversationId/clear', authMiddleware, clearChat)


export default router  //* Exporting the router so it can be used in 'index.js' file