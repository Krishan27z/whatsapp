import { Server } from "socket.io"
import User from "../models/UserModel.js"
import Message from "../models/Message.js"
import Conversation from "../models/Conversation.js"
import mongoose from "mongoose"
import handleVideoCallEvent from "./videoCallEvents.js"
import socketMiddleware from "../middlewares/socketMiddleware.js"


// 🔴 REAL-TIME STATUS STORAGE
const userConnections = new Map() // userId -> Set of socketIds
const activeChatWindows = new Map() // userId -> Set of conversationIds
const typingUsers = new Map() // userId -> {conversationId: true, timeout}



const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000,
            skipMiddlewares: true
        },
        // 🔴 FIX: Add reconnection options
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    })

    // 🔴 INITIALIZE ACTIVE CHAT WINDOWS IF NOT EXISTS
    if (!io.activeChatWindows) {
        io.activeChatWindows = new Map()
    }
    if (!io.userConnections) {
        io.userConnections = new Map()
    }
    if (!io.typingUsers) {
        io.typingUsers = new Map()
    }


    // 🔴 ULTRA-FAST UPDATE EMITTER
    const emitToUser = (userId, event, data) => {
        if (!userId || !io) return

        const userSockets = userConnections.get(userId.toString())
        if (userSockets && userSockets.size > 0) {
            const eventData = {
                ...data,
                targetUserId: userId.toString(),
                immediate: true,
                timestamp: Date.now()
            }

            userSockets.forEach((_, socketId) => {
                io.to(socketId).emit(event, eventData)
            })

            console.log(`⚡ ${event} to ${userId}`)
            return true
        }
        return false
    }

    const emitToUsers = (userIds, event, data) => {
        if (!userIds || !Array.isArray(userIds) || !io) return

        userIds.forEach(userId => {
            emitToUser(userId, event, data)
        })
    }

    const updateAndBroadcastUserStatus = async (userId, isOnline) => {
        try {
            await User.findByIdAndUpdate(userId, {
                isOnline: isOnline,
                lastSeen: new Date()
            }, { new: true })

            const user = await User.findById(userId).select("contacts").lean()

            if (user && user.contacts && user.contacts.length > 0) {
                user.contacts.forEach(contactId => {
                    emitToUser(contactId.toString(), "user_status", {
                        userId: userId,
                        isOnline: isOnline,
                        lastSeen: new Date(),
                        immediate: true
                    })
                })
            }

            io.emit("global_user_status", {
                userId: userId,
                isOnline: isOnline,
                lastSeen: new Date(),
                immediate: true
            })

            console.log(`📡 User ${userId} status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`)
        } catch (error) {
            console.error("❌ Status broadcast error:", error)
        }
    }


    const updateOfflineMessagesToDelivered = async (userId) => {
        try {
            // Find all messages sent to this user while they were offline
            const pendingMessages = await Message.find({
                receiver: userId,
                messageStatus: "sent"
            })
                .sort({ createdAt: 1 })
                .limit(100) // Limit to avoid performance issues

            if (pendingMessages.length === 0) return

            // Update to delivered
            const messageIds = pendingMessages.map(m => m._id)
            await Message.updateMany(
                { _id: { $in: messageIds } },
                { $set: { messageStatus: "delivered" } }
            )

            // Group by sender to notify
            const messagesBySender = {}
            pendingMessages.forEach(msg => {
                const senderId = msg.sender.toString()
                if (!messagesBySender[senderId]) {
                    messagesBySender[senderId] = []
                }
                messagesBySender[senderId].push({
                    messageId: msg._id,
                    conversationId: msg.conversation
                })
            })

            // Notify each sender
            for (const [senderId, messages] of Object.entries(messagesBySender)) {
                const senderSockets = userConnections.get(senderId)
                if (senderSockets) {
                    messages.forEach(({ messageId, conversationId }) => {
                        senderSockets.forEach((_, socketId) => {
                            io.to(socketId).emit("message_status_update", {
                                messageId,
                                messageStatus: "delivered",
                                conversationId,
                                immediate: true,
                                timestamp: Date.now()
                            })
                        })
                    })
                }
            }

            console.log(`✅ Updated ${pendingMessages.length} messages to delivered for user ${userId}`)
        } catch (error) {
            console.error("❌ Error updating offline messages:", error)
        }
    }

    //! Middleware for Socket Authentication
    io.use(socketMiddleware)



    io.on("connection", (socket) => {
        console.log("🔌 User connected", socket.id)
        let userId = null
        let browserId = null

        // 🔴 FIX: Store userId in socket for later use
        socket.userId = null

        // 🔴 HEARTBEAT FOR REAL-TIME STATUS
        socket.on("heartbeat", (data) => {
            if (userId) {
                socket.emit("heartbeat_ack", { timestamp: Date.now() })

                const userSockets = userConnections.get(userId)
                if (userSockets && userSockets.size > 0) {
                    io.emit("user_heartbeat", {
                        userId: userId,
                        timestamp: Date.now(),
                        isOnline: true,
                        immediate: true
                    })
                }
            }
        })

        // 🔴 USER CONNECTED - INSTANT ONLINE
        socket.on("user_connected", async (data) => {
            try {
                userId = data.userId
                browserId = data.browserId || socket.id

                socket.userId = userId //* It will help in handling Video Call Events

                console.log(`📡 User connected: ${userId}`)

                // Add to connections
                if (!userConnections.has(userId)) {
                    userConnections.set(userId, new Set())
                }
                userConnections.get(userId).add(socket.id)

                socket.join(userId)
                socket.join(`user:${userId}`)

                // Update status to online
                await updateAndBroadcastUserStatus(userId, true)

                // 🔴 CRITICAL: Update all sent messages to delivered
                await updateOfflineMessagesToDelivered(userId)

                console.log(`✅ User ${userId} marked ONLINE with instant updates`)

            } catch (error) {
                console.error("❌ Connection error:", error)
            }
        })

        // 🔴 GET IMMEDIATE USER STATUS
        socket.on("get_immediate_status", async (requestedUserId, callback) => {
            try {
                //! Handle cases where requestedUserId might be an object containing userId or just a string
                const userId = typeof requestedUserId === 'object' && requestedUserId !== null
                    ? requestedUserId.userId || requestedUserId.id
                    : requestedUserId;

                if (!userId) {
                    return callback && callback({
                        userId: requestedUserId,
                        isOnline: false,
                        lastSeen: null,
                        error: "Invalid userId"
                    });
                }

                const hasActiveConnection = userConnections.has(userId) &&
                    userConnections.get(userId).size > 0

                let user = await User.findById(userId).select("username profilePicture lastSeen isOnline")

                const response = {
                    userId: userId,
                    isOnline: hasActiveConnection,
                    lastSeen: user?.lastSeen || new Date(),
                    hasActiveConnection: hasActiveConnection,
                    connectionCount: hasActiveConnection ? userConnections.get(userId).size : 0,
                    timestamp: Date.now(),
                    immediate: true
                }

                if (callback) callback(response)
            } catch (error) {
                console.error("❌ Immediate status error:", error)
                if (callback) callback({
                    userId: requestedUserId,
                    isOnline: false,
                    lastSeen: null,
                    immediate: true
                })
            }
        })

        // 🔴 GET USER STATUS (for chat window)
        socket.on("get_user_status", async (requestedUserId, callback) => {
            try {
                const userId = typeof requestedUserId === 'object' && requestedUserId !== null
                    ? requestedUserId.userId || requestedUserId.id
                    : requestedUserId;

                if (!userId) {
                    return callback && callback({
                        userId: requestedUserId,
                        isOnline: false,
                        lastSeen: null
                    });
                }
                const hasActiveConnection = userConnections.has(userId) &&
                    userConnections.get(userId).size > 0

                let user = await User.findById(userId).select("username profilePicture lastSeen isOnline")

                const responseData = {
                    userId: userId,
                    isOnline: hasActiveConnection,
                    lastSeen: user?.lastSeen || null,
                    profilePicture: user?.profilePicture || null,
                    username: user?.username || null,
                    connectionCount: hasActiveConnection ? userConnections.get(userId)?.size || 0 : 0,
                    timestamp: Date.now(),
                    immediate: true
                }

                console.log(`📊 User ${requestedUserId} status:`, {
                    isOnline: responseData.isOnline,
                    connections: responseData.connectionCount
                })

                if (callback) {
                    callback(responseData)
                }
            } catch (error) {
                console.error("❌ Error in get_user_status:", error)
                const errorResponse = {
                    userId: requestedUserId,
                    isOnline: false,
                    lastSeen: null,
                    immediate: true
                }
                if (callback) callback(errorResponse)
            }
        })

        // 🔴 GET ALL ONLINE USERS
        socket.on("get_online_users", (callback) => {
            try {
                const onlineUsers = []
                for (const [userId, sockets] of userConnections.entries()) {
                    if (sockets.size > 0) {
                        onlineUsers.push({
                            userId,
                            connectionCount: sockets.size,
                            isOnline: true,
                            immediate: true
                        })
                    }
                }
                if (callback) callback(onlineUsers)
            } catch (error) {
                console.error("❌ Error getting online users:", error)
                if (callback) callback([])
            }
        })

        // 🔴 USER ENTERED CHAT WINDOW - FIX BADGE CLEARING & INSTANT BLUE TICK
        socket.on("enter_chat_window", async ({ conversationId, userId }) => {
            try {
                console.log(`🔵 ENTER_CHAT_WINDOW: User ${userId} -> Chat ${conversationId}`)

                if (!userId || !conversationId) return

                // 1. MARK USER AS IN CHAT WINDOW (IMMEDIATE)
                if (!activeChatWindows.has(userId)) {
                    activeChatWindows.set(userId, new Set())
                }
                activeChatWindows.get(userId).add(conversationId.toString())

                // 2. GET CONVERSATION
                const conversation = await Conversation.findById(conversationId)
                if (!conversation) {
                    console.error(`❌ Conversation ${conversationId} not found`)
                    return
                }

                const otherParticipantId = conversation.participants.find(
                    p => p.toString() !== userId.toString()
                )

                if (!otherParticipantId) {
                    console.error(`❌ Other participant not found in conversation ${conversationId}`)
                    return
                }

                // 3. IMMEDIATE DATABASE UPDATES (ATOMIC)
                const session = await mongoose.startSession()
                session.startTransaction()

                try {
                    // A) Update all delivered messages to READ
                    const updateResult = await Message.updateMany(
                        {
                            conversation: conversationId,
                            receiver: userId,
                            messageStatus: { $in: ["sent", "delivered"] }
                        },
                        { $set: { messageStatus: "read" } },
                        { session }
                    )

                    console.log(`📨 Marked ${updateResult.modifiedCount} messages as READ`)

                    // B) Reset unread count to 0
                    conversation.unreadCounts.set(userId.toString(), 0)
                    await conversation.save({ session })

                    // C) Update conversation's last message if needed
                    await conversation.save({ session })

                    await session.commitTransaction()
                    console.log("✅ Database updates committed")

                } catch (transactionError) {
                    await session.abortTransaction()
                    console.error("❌ Transaction failed:", transactionError)
                    throw transactionError
                } finally {
                    session.endSession()
                }

                // 4. GET UPDATED MESSAGES FOR BLUE TICK
                const readMessages = await Message.find({
                    conversation: conversationId,
                    receiver: userId,
                    sender: otherParticipantId,
                    messageStatus: "read"
                }).select("_id createdAt").sort({ createdAt: -1 }).limit(50)

                const messageIds = readMessages.map(m => m._id.toString())
                console.log(`🔵 ${messageIds.length} messages marked READ for blue tick`)

                // 5. 🔴 INSTANT SOCKET EMISSIONS (WITHIN 100ms)

                // A) NOTIFY SENDER ABOUT BLUE TICK
                const otherParticipantSockets = userConnections.get(otherParticipantId.toString());
                if (otherParticipantSockets && otherParticipantSockets.size > 0) {
                    // Use microtask for fastest execution
                    Promise.resolve().then(() => {
                        otherParticipantSockets.forEach((_, otherSocketId) => {
                            // Send batch update for speed
                            io.to(otherSocketId).emit("messages_read", {
                                conversationId,
                                readerId: userId,
                                messageIds,
                                immediate: true,
                                timestamp: Date.now()
                            })

                            // Individual status updates
                            messageIds.forEach(messageId => {
                                io.to(otherSocketId).emit("message_status_update", {
                                    messageId,
                                    messageStatus: "read",
                                    conversationId,
                                    immediate: true,
                                    timestamp: Date.now()
                                })
                            })
                        })
                    })
                }

                // B) CLEAR BADGE FOR USER (IMMEDIATE - 30ms)
                setTimeout(() => {
                    const userSockets = userConnections.get(userId.toString());
                    if (userSockets && userSockets.size > 0) {
                        userSockets.forEach((_, userSocketId) => {
                            io.to(userSocketId).emit("instant_badge", {
                                conversationId,
                                badgeCount: 0,
                                immediate: true,
                                timestamp: Date.now()
                            });

                            io.to(userSocketId).emit("badge_cleared", {
                                conversationId,
                                userId,
                                immediate: true,
                                timestamp: Date.now()
                            });
                        });
                    }
                }, 30)

                // C) UPDATE CONVERSATION (FAST - 80ms)
                setTimeout(async () => {
                    const updatedConversation = await Conversation.findById(conversationId)
                        .populate("participants", "username profilePicture lastSeen isOnline")
                        .populate({
                            path: "lastMessage",
                            populate: [
                                { path: "sender", select: "username profilePicture" },
                                { path: "receiver", select: "username profilePicture" }
                            ]
                        });

                    if (updatedConversation) {
                        const conversationData = {
                            ...updatedConversation.toObject(),
                            unreadCounts: Object.fromEntries(updatedConversation.unreadCounts || new Map()),
                            immediate: true,
                            timestamp: Date.now()
                        };

                        const allParticipants = [userId.toString(), otherParticipantId.toString()];
                        allParticipants.forEach(participantId => {
                            const participantSockets = userConnections.get(participantId);
                            if (participantSockets) {
                                participantSockets.forEach((_, participantSocketId) => {
                                    io.to(participantSocketId).emit("conversation_updated", conversationData);
                                });
                            }
                        });
                    }
                }, 80)

                console.log(`✅ ENTER_CHAT_WINDOW completed for user ${userId}`)

            } catch (error) {
                console.error("❌ CRITICAL ERROR in enter_chat_window:", error)
            }
        })


        // 🔴 ADD THIS NEW EVENT FOR REAL-TIME CHAT WINDOW TRACKING
        socket.on("user_in_chat_window", ({ conversationId, userId, isInWindow }) => {
            try {
                if (!userId || !conversationId) return

                if (!activeChatWindows.has(userId)) {
                    activeChatWindows.set(userId, new Set())
                }

                if (isInWindow) {
                    activeChatWindows.get(userId).add(conversationId.toString())
                    console.log(`👁️ User ${userId} IN chat window ${conversationId}`)
                } else {
                    activeChatWindows.get(userId).delete(conversationId.toString())
                    console.log(`🚪 User ${userId} LEFT chat window ${conversationId}`)
                }

                // 🔴 BROADCAST TO ALL (FOR SEND MESSAGE LOGIC)
                io.emit("active_chat_update", {
                    userId,
                    conversationId,
                    isInWindow,
                    timestamp: Date.now()
                })

            } catch (error) {
                console.error("❌ Error in user_in_chat_window:", error)
            }
        })


        // 🔴 USER LEFT CHAT WINDOW
        socket.on("leave_chat_window", ({ conversationId, userId }) => {
            try {
                if (!userId || !conversationId) return

                if (activeChatWindows.has(userId)) {
                    activeChatWindows.get(userId).delete(conversationId.toString())
                    console.log(`💬 User ${userId} left chat ${conversationId}`)
                }
            } catch (error) {
                console.error("❌ Error in leave_chat_window:", error)
            }
        })

        // 🔴 TYPING START
        socket.on("typing_start", ({ conversationId, receiverId, userId }) => {
            if (!userId || !conversationId || !receiverId) return

            try {
                if (!typingUsers.has(userId)) {
                    typingUsers.set(userId, {})
                }

                const userTyping = typingUsers.get(userId)
                userTyping[conversationId] = true

                if (userTyping[`${conversationId}_timeout`]) {
                    clearTimeout(userTyping[`${conversationId}_timeout`])
                }

                userTyping[`${conversationId}_timeout`] = setTimeout(() => {
                    if (userTyping[conversationId]) {
                        userTyping[conversationId] = false
                        const receiverSockets = userConnections.get(receiverId)
                        if (receiverSockets) {
                            receiverSockets.forEach((_, receiverSocketId) => {
                                io.to(receiverSocketId).emit("user_typing", {
                                    userId,
                                    conversationId,
                                    isTyping: false,
                                    location: "both",
                                    immediate: true
                                })
                            })
                        }
                    }
                }, 700)

                const receiverSockets = userConnections.get(receiverId)
                if (receiverSockets) {
                    receiverSockets.forEach((_, receiverSocketId) => {
                        io.to(receiverSocketId).emit("user_typing", {
                            userId,
                            conversationId,
                            isTyping: true,
                            location: "both",
                            immediate: true
                        })
                    })
                }
            } catch (error) {
                console.error("❌ Error in typing_start", error)
            }
        })

        // 🔴 TYPING STOP
        socket.on("typing_stop", ({ conversationId, receiverId, userId }) => {
            if (!userId || !conversationId || !receiverId) return

            try {
                if (typingUsers.has(userId)) {
                    const userTyping = typingUsers.get(userId)

                    if (userTyping[`${conversationId}_timeout`]) {
                        clearTimeout(userTyping[`${conversationId}_timeout`])
                        delete userTyping[`${conversationId}_timeout`]
                    }

                    userTyping[conversationId] = false
                }

                const receiverSockets = userConnections.get(receiverId)
                if (receiverSockets) {
                    receiverSockets.forEach((_, receiverSocketId) => {
                        io.to(receiverSocketId).emit("user_typing", {
                            userId,
                            conversationId,
                            isTyping: false,
                            location: "both",
                            immediate: true
                        })
                    })
                }
            } catch (error) {
                console.error("❌ Error in typing_stop", error)
            }
        })


        // 🔴 MESSAGE DELIVERED (UPDATE SINGLE TO DOUBLE TICK)
        socket.on("message_delivered", async ({ messageId, conversationId, receiverId, immediate }) => {
            try {
                // Update message status to delivered
                await Message.findByIdAndUpdate(messageId, {
                    messageStatus: "delivered",
                    updatedAt: new Date()
                })

                // Notify sender
                const message = await Message.findById(messageId)
                if (message) {
                    const senderId = message.sender.toString()
                    const senderSockets = userConnections.get(senderId)

                    if (senderSockets) {
                        senderSockets.forEach((_, senderSocketId) => {
                            io.to(senderSocketId).emit("message_status_update", {
                                messageId,
                                messageStatus: "delivered",
                                conversationId,
                                immediate: true
                            })
                        })
                    }
                }
            } catch (error) {
                console.error("❌ Error updating message delivered:", error)
            }
        })


        // 🔴 MESSAGE READ STATUS (BLUE TICK)
        socket.on("message_read", async ({ messageIds, senderId, conversationId }) => {
            try {
                await Message.updateMany(
                    { _id: { $in: messageIds } },
                    { $set: { messageStatus: "read" } }
                )

                // Notify sender
                const senderSockets = userConnections.get(senderId)
                if (senderSockets) {
                    senderSockets.forEach((_, senderSocketId) => {
                        io.to(senderSocketId).emit("message_status_update", {
                            messageIds,
                            messageStatus: "read",
                            conversationId,
                            immediate: true
                        })
                    })
                }

                // Update conversation
                if (conversationId) {
                    const conversation = await Conversation.findById(conversationId)
                    if (conversation) {
                        conversation.unreadCounts.set(userId, 0)
                        await conversation.save()

                        const updatedConversation = await Conversation.findById(conversationId)
                            .populate("participants", "username profilePicture lastSeen isOnline")
                            .populate({
                                path: "lastMessage",
                                populate: [
                                    { path: "sender", select: "username profilePicture" },
                                    { path: "receiver", select: "username profilePicture" }
                                ]
                            })

                        if (updatedConversation) {
                            const conversationData = {
                                ...updatedConversation.toObject(),
                                unreadCounts: Object.fromEntries(updatedConversation.unreadCounts || new Map()),
                                immediate: true
                            }

                            conversation.participants.forEach(participant => {
                                const participantId = participant._id.toString()
                                const participantSockets = userConnections.get(participantId)
                                if (participantSockets) {
                                    participantSockets.forEach((_, participantSocketId) => {
                                        io.to(participantSocketId).emit("conversation_updated", conversationData)
                                    })
                                }
                            })
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Error updating message read status", error)
            }
        })

        // 🔴 REACTIONS - INSTANT
        socket.on("add_reactions", async (data) => {
            try {
                const { messageId, emoji, userId, action } = data;

                if (!messageId || !userId) return;

                const message = await Message.findById(messageId);
                if (!message) return;

                const conversationId = message.conversation.toString();

                if (!Array.isArray(message.reactions)) {
                    message.reactions = [];
                }

                const userObjectId = new mongoose.Types.ObjectId(userId);

                const existingIndex = message.reactions.findIndex(
                    r => r.user && r.user.equals(userObjectId)
                );

                if (action === 'add') {
                    if (existingIndex !== -1) {
                        message.reactions.splice(existingIndex, 1);
                    }

                    message.reactions.push({
                        emoji: emoji,
                        user: userObjectId,
                        _id: new mongoose.Types.ObjectId(),
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });

                } else if (action === 'remove') {
                    if (existingIndex !== -1) {
                        message.reactions.splice(existingIndex, 1);
                    }
                }

                message.markModified('reactions');
                const savedMessage = await message.save();

                const conversation = await Conversation.findById(conversationId)
                    .populate('participants', '_id');

                if (!conversation) return;

                const populatedMessage = await Message.findById(messageId)
                    .populate({
                        path: 'reactions.user',
                        select: '_id username name profilePicture'
                    });

                const reactionData = {
                    messageId: savedMessage._id.toString(),
                    reactions: populatedMessage.reactions.map(r => ({
                        _id: r._id?.toString(),
                        emoji: r.emoji,
                        user: r.user?._id?.toString() || r.user?.toString(),
                        userName: r.user?.username || r.user?.name,
                        createdAt: r.createdAt,
                        updatedAt: r.updatedAt
                    })),
                    immediate: true
                };

                // 🔴 INSTANT EMIT TO ALL PARTICIPANTS
                conversation.participants.forEach(participant => {
                    const participantId = participant._id.toString()
                    const participantSockets = userConnections.get(participantId)
                    if (participantSockets) {
                        participantSockets.forEach((_, participantSocketId) => {
                            io.to(participantSocketId).emit("reactions_update", {
                                ...reactionData,
                                conversationId
                            })
                        })
                    }
                })

            } catch (error) {
                console.error("❌ BACKEND ERROR in add_reactions:", error);
            }
        })


        // 🔴 MESSAGE DELETE BROADCAST (INSTANT FOR BOTH USERS)
        socket.on("message_delete_broadcast", async ({ messageId, conversationId, deletedForEveryone, deleterId }) => {
            try {
                console.log("🗑️ MESSAGE DELETE BROADCAST:", { messageId, conversationId, deletedForEveryone, deleterId });

                const message = await Message.findById(messageId);
                if (!message) {
                    console.log("❌ Message not found");
                    return;
                }

                const senderId = message.sender.toString();
                const receiverId = message.receiver.toString();

                if (deletedForEveryone) {
                    await Message.deleteOne({ _id: messageId });

                    const lastMsg = await Message.findOne({ conversation: conversationId })
                        .sort({ createdAt: -1 })
                        .limit(1);

                    await Conversation.findByIdAndUpdate(conversationId, {
                        lastMessage: lastMsg ? lastMsg._id : null,
                        updatedAt: new Date()
                    });

                    const updatedConversation = await Conversation.findById(conversationId)
                        .populate("participants", "username profilePicture lastSeen isOnline")
                        .populate({
                            path: "lastMessage",
                            populate: [
                                { path: "sender", select: "username profilePicture" },
                                { path: "receiver", select: "username profilePicture" }
                            ]
                        });

                    const conversationData = {
                        ...updatedConversation.toObject(),
                        unreadCounts: Object.fromEntries(updatedConversation.unreadCounts || new Map()),
                        immediate: true
                    };

                    // 🔴 INSTANT EMIT TO SENDER (100ms)
                    setTimeout(() => {
                        emitToUser(senderId, "message_deleted_instant", {
                            messageId,
                            conversationId,
                            deletedForEveryone: true,
                            immediate: true
                        });

                        emitToUser(senderId, "conversation_updated_instant", conversationData);
                    }, 100);

                    // 🔴 INSTANT EMIT TO RECEIVER (300ms)
                    setTimeout(() => {
                        emitToUser(receiverId, "message_deleted_instant", {
                            messageId,
                            conversationId,
                            deletedForEveryone: true,
                            immediate: true
                        });

                        emitToUser(receiverId, "conversation_updated_instant", conversationData);
                    }, 300);

                    console.log(`✅ Message ${messageId} deleted for everyone - INSTANT UPDATES SENT`);

                } else {
                    if (!message.deletedFor) {
                        message.deletedFor = [];
                    }
                    if (!message.deletedFor.includes(deleterId)) {
                        message.deletedFor.push(deleterId);
                        await message.save();
                    }

                    const lastMsgForUser = await Message.findOne({
                        conversation: conversationId,
                        deletedFor: { $nin: [deleterId] }
                    }).sort({ createdAt: -1 }).limit(1);

                    const conversation = await Conversation.findById(conversationId)
                        .populate("participants", "username profilePicture lastSeen isOnline")
                        .populate({
                            path: "lastMessage",
                            populate: [
                                { path: "sender", select: "username profilePicture" },
                                { path: "receiver", select: "username profilePicture" }
                            ]
                        });

                    const conversationData = {
                        ...conversation.toObject(),
                        lastMessage: lastMsgForUser || null,
                        unreadCounts: Object.fromEntries(conversation.unreadCounts || new Map()),
                        immediate: true
                    };

                    // 🔴 INSTANT EMIT TO DELETER ONLY (100ms)
                    setTimeout(() => {
                        emitToUser(deleterId, "message_deleted_instant", {
                            messageId,
                            conversationId,
                            deletedForEveryone: false,
                            deletedForMe: true,
                            immediate: true
                        });

                        emitToUser(deleterId, "conversation_updated_instant", conversationData);
                    }, 100);

                    console.log(`✅ Message ${messageId} deleted for me only - INSTANT UPDATE SENT TO ${deleterId}`);
                }

            } catch (error) {
                console.error("❌ Error in message_delete_broadcast:", error);
            }
        })

        // 🔴 ULTRA-FAST MESSAGE DELIVERY (NEW EVENT)
        socket.on("receive_message_ultrafast", (messageData) => {
            // Broadcast to all connected clients (fastest path)
            io.emit("receive_message", {
                ...messageData,
                ultraFast: true,
                timestamp: Date.now()
            });
        })

        // 🔴 NEW MESSAGE BADGE NOTIFICATION (NEW EVENT)
        socket.on("new_message_badge", ({ conversationId, messageId }) => {
            // Forward badge notification to specific conversation participants
            io.emit("badge_update", {
                conversationId,
                messageId,
                timestamp: Date.now(),
                immediate: true
            });
        })

        // 🔴 UPDATE CONVERSATION
        socket.on("update_conversation_broadcast", (conversationData) => {
            if (conversationData?.participants) {
                conversationData.participants.forEach(participant => {
                    const participantId = participant._id?.toString() || participant.toString()
                    const participantSockets = userConnections.get(participantId)
                    if (participantSockets) {
                        participantSockets.forEach((_, participantSocketId) => {
                            io.to(participantSocketId).emit("conversation_updated", {
                                ...conversationData,
                                immediate: true
                            })
                        })
                    }
                })
            }
        })

        // 🔴 JOIN CONVERSATION ROOM
        socket.on("join_conversation", (conversationId) => {
            if (!conversationId || !socket.id) return
            socket.join(`conversation_${conversationId}`)
            console.log(`👥 Socket ${socket.id} joined conversation ${conversationId}`)
        })

        // 🔴 LEAVE CONVERSATION ROOM
        socket.on("leave_conversation", (conversationId) => {
            if (!conversationId || !socket.id) return
            socket.leave(`conversation_${conversationId}`)
            console.log(`👥 Socket ${socket.id} left conversation ${conversationId}`)
        })

        // 🔴 INSTANT BADGE UPDATE
        socket.on("instant_badge_update", (data) => {
            const { conversationId, targetUserId } = data

            if (targetUserId) {
                emitToUser(targetUserId, "instant_badge_update", data)
            } else {
                io.emit("instant_badge_update", data)
            }
        })

        // 🔴 INSTANT CHAT LIST UPDATE
        socket.on("instant_chatlist_update", (data) => {
            io.emit("instant_chatlist_update", {
                ...data,
                immediate: true,
                timestamp: Date.now()
            })
        })

        // 🔴 CHECK CHAT WINDOW
        socket.on("check_chat_window", ({ userId, conversationId }, callback) => {
            try {
                const isInChatWindow = activeChatWindows.has(userId) &&
                    activeChatWindows.get(userId).has(conversationId.toString())

                if (callback) {
                    callback({ isInChatWindow })
                }
            } catch (error) {
                console.error("❌ Error in check_chat_window:", error)
                if (callback) callback({ isInChatWindow: false })
            }
        })


        //! ========== Handle Video Call Events ========== 
        handleVideoCallEvent(socket, io, userConnections)


        //! ======== Status Related Socket Events =========

        socket.on("status_move", ({ statusId, newPosition, userId }) => {
            try {
                const userSockets = userConnections.get(userId);
                if (userSockets) {
                    userSockets.forEach((_, socketId) => {
                        io.to(socketId).emit("status_moved", {
                            statusId,
                            newPosition,
                            userId,
                            immediate: true,
                            timestamp: Date.now()
                        });
                    });
                }
            } catch (error) {
                console.error("❌ Error in status_move:", error);
            }
        })

        socket.on("status_delete_request", ({ statusId, userId }) => {
            try {
                const userSockets = userConnections.get(userId);
                if (userSockets) {
                    userSockets.forEach((_, socketId) => {
                        io.to(socketId).emit("status_delete_confirmed", {
                            statusId,
                            userId,
                            immediate: true,
                            timestamp: Date.now()
                        });
                    });
                }
            } catch (error) {
                console.error("❌ Error in status_delete_request:", error);
            }
        })

        socket.on("status_seen_by", ({ statusId, viewerId, userId }) => {
            try {
                if (userId && userId !== viewerId) {
                    emitToUser(userId, "status_seen_update", {
                        statusId,
                        viewerId,
                        immediate: true,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.error("❌ Error in status_seen_by:", error);
            }
        })

        socket.on("mark_all_statuses_viewed", ({ userId }) => {
            // Broadcast to all OTHER sockets of this user
            const userSockets = userConnections.get(userId);
            if (userSockets) {
                userSockets.forEach((_, socketId) => {
                    if (socketId !== socket.id) {   // skip the sender
                        io.to(socketId).emit("all_statuses_viewed", {
                            userId,
                            timestamp: Date.now()
                        });
                    }
                });
            }
        })





        // 🔴 DISCONNECTION HANDLER - INSTANT OFFLINE
        const handleDisconnected = async () => {
            if (!userId) return

            try {
                console.log(`🔌 User ${userId} disconnected`)

                if (userConnections.has(userId)) {
                    const userSockets = userConnections.get(userId)
                    userSockets.delete(socket.id)

                    if (userSockets.size === 0) {
                        userConnections.delete(userId)
                        await updateAndBroadcastUserStatus(userId, false)
                        console.log(`📴 User ${userId} marked OFFLINE`)
                    } else {
                        console.log(`📱 User ${userId} still has ${userSockets.size} connections`)
                    }
                }

                // Clean up typing
                if (typingUsers.has(userId)) {
                    const userTyping = typingUsers.get(userId)
                    Object.keys(userTyping).forEach((key) => {
                        if (key.endsWith('_timeout')) {
                            clearTimeout(userTyping[key])
                        }
                    })
                    typingUsers.delete(userId)
                }

                // Clean up active chat windows
                if (activeChatWindows.has(userId)) {
                    activeChatWindows.delete(userId)
                }

                socket.leave(userId)
                socket.leave('online_users')

                console.log(`✅ User ${userId} cleanup done`)
            } catch (error) {
                console.error("❌ Error handling disconnection", error)
            }
        }

        // 🔴 DISCONNECT EVENT
        socket.on("disconnect", handleDisconnected)

        // 🔴 BROWSER CLOSE EVENT
        socket.on("browser_close", async () => {
            if (!userId) return

            console.log(`🌐 Browser closed for user ${userId}`)
            await handleDisconnected()
        })

        // 🔴 USER LOGOUT
        socket.on("user_logout", async () => {
            if (!userId) return

            console.log(`🚪 User ${userId} logged out`)

            userConnections.delete(userId)
            activeChatWindows.delete(userId)
            typingUsers.delete(userId)

            await updateAndBroadcastUserStatus(userId, false)

            console.log(`✅ User ${userId} logged out`)
        })

        // 🔴 PING/PONG
        socket.on("ping", (cb) => {
            if (cb) cb()
        })
    })

    // 🔴 PERIODIC CLEANUP
    setInterval(() => {
        for (const [userId, sockets] of userConnections.entries()) {
            let hasActiveSockets = false
            for (const [socketId, data] of sockets.entries()) {
                const socketInstance = io.sockets.sockets.get(socketId)
                if (!socketInstance || !socketInstance.connected) {
                    sockets.delete(socketId)
                } else {
                    hasActiveSockets = true
                }
            }
            if (!hasActiveSockets) {
                userConnections.delete(userId)
                console.log(`🧹 Removed inactive user ${userId}`)
            }
        }
    }, 2000)

    // Store maps for external access
    io.userConnections = userConnections
    io.activeChatWindows = activeChatWindows
    io.typingUsers = typingUsers
    io.emitToUser = emitToUser
    io.emitToUsers = emitToUsers

    return io
}

export default initializeSocket