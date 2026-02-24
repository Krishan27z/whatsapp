import { uploadFileToCloudinary, uploadVideoToCloudinary, deleteFromCloudinary } from "../config/cloudinaryConfig.js"
import Conversation from "../models/Conversation.js"
import Message from "../models/Message.js"
import response from "../utils/responseHandler.js"

//! =======================================================================
//* 🟢 ULTIMATE WHATSAPP-STYLE SEND MESSAGE - REAL-TIME FIXED
//! =======================================================================

//^ 1️⃣) SEND MESSAGES --------->
const sendMessage = async (req, res) => {
    try {
        const { senderId, receiverId, content, clientId } = req.body
        const file = req.file
        const isVideo = req.body.isVideo

        // 🔴 VALIDATE
        if (!senderId || !receiverId) {
            return response(res, 400, false, "Sender and receiver required")
        }

        // Sort participants
        const participants = [senderId, receiverId].sort()

        // 🔴 GET SOCKET DATA IMMEDIATELY
        const socketUserMap = req.socketUserMap || new Map()
        const activeChatWindows = req.activeChatWindows || new Map()
        const io = req.io

        // 🔴 CHECK RECEIVER'S REAL-TIME STATUS
        const receiverSocketIds = socketUserMap.get(receiverId.toString()) || new Set()
        const senderSocketIds = socketUserMap.get(senderId.toString()) || new Set()

        const isReceiverOnline = receiverSocketIds.size > 0
        let isReceiverInThisChat = false

        // Find existing conversation to check active chat
        let conversation = await Conversation.findOne({ participants: participants })

        if (conversation) {
            const receiverActiveChats = activeChatWindows.get(receiverId.toString()) || new Set()
            isReceiverInThisChat = receiverActiveChats.has(conversation._id.toString())
        }

        console.log("🎯 REAL-TIME RECEIVER CHECK:", {
            receiverId,
            isReceiverOnline,
            isReceiverInThisChat,
            receiverSockets: receiverSocketIds.size,
            senderSockets: senderSocketIds.size
        })

        // 🔴 WHATSAPP LOGIC: INSTANT STATUS DECISION
        let messageStatus = "sent" // Default: single tick
        let shouldShowBadge = true // Default: show badge

        if (isReceiverOnline) {
            messageStatus = "delivered" // Double tick

            if (isReceiverInThisChat) {
                // 🔵 BLUE TICK IMMEDIATELY (BOTH IN CHAT)
                messageStatus = "read"
                shouldShowBadge = false
                console.log("🔵 BLUE TICK: Receiver is ACTIVE in this chat window")
            } else {
                console.log("✅ DOUBLE TICK: Receiver online but NOT in chat")
            }
        } else {
            console.log("📴 SINGLE TICK: Receiver offline")
        }

        // Create or get conversation
        if (!conversation) {
            conversation = new Conversation({
                participants: participants,
                unreadCounts: new Map()
            })
            await conversation.save()
        }

        // Handle media upload
        let imageOrVideoUrl = null
        let contentType = null
        let fileName = null
        let fileSize = null
        let fileType = null
        let publicId = null

        if (file) {
            console.log("📤 UPLOADING FILE:", {
                name: file.originalname,
                type: file.mimetype,
                size: (file.size / 1024 / 1024).toFixed(2) + " MB"
            })

            try {
                const lowerName = file.originalname.toLowerCase()
                const isVideoFile = isVideo === 'true' ||
                    file.mimetype.startsWith('video/') ||
                    file.mimetype.startsWith('audio/') ||
                    lowerName.endsWith('.mp4') ||
                    lowerName.endsWith('.mov') ||
                    lowerName.endsWith('.avi') ||
                    lowerName.endsWith('.mkv') ||
                    lowerName.endsWith('.mp3') ||
                    lowerName.endsWith('.wav')

                let uploadResult

                if (isVideoFile) {
                    // Smart timeout based on file size
                    const fileSizeMB = file.size / (1024 * 1024)
                    let timeout = 120000 // 2 minutes default

                    if (fileSizeMB > 100) timeout = 300000 // 5 minutes
                    else if (fileSizeMB > 50) timeout = 180000 // 3 minutes
                    else if (fileSizeMB > 20) timeout = 120000 // 2 minutes

                    uploadResult = await uploadVideoToCloudinary(file, { timeout })
                    contentType = file.mimetype.startsWith('audio/') ? "audio" : "video"
                } else {
                    uploadResult = await uploadFileToCloudinary(file)
                    contentType = file.mimetype.startsWith('image/') ? "image" : "document"
                }

                if (!uploadResult?.secure_url) {
                    return response(res, 400, false, "Upload failed - no URL returned")
                }

                imageOrVideoUrl = uploadResult.secure_url
                fileName = file.originalname
                fileSize = file.size
                fileType = file.mimetype
                publicId = uploadResult.public_id

                console.log("✅ Upload complete")

            } catch (uploadError) {
                console.error("❌ Upload failed:", uploadError)

                let errorMsg = "Upload failed"
                if (uploadError.message.includes('timeout')) {
                    errorMsg = "Upload timeout. Try a smaller file."
                } else if (uploadError.http_code === 413) {
                    errorMsg = "File too large. Maximum 500MB allowed."
                }

                return response(res, 400, false, errorMsg)
            }
        } else if (content?.trim()) {
            contentType = 'text'
        } else {
            return response(res, 400, false, "Content required")
        }

        // 🔴 CREATE MESSAGE WITH CORRECT STATUS
        const message = new Message({
            conversation: conversation._id,
            sender: senderId,
            receiver: receiverId,
            content: content,
            contentType: contentType,
            imageOrVideoUrl: imageOrVideoUrl,
            publicId: publicId,
            messageStatus: messageStatus,
            ...(contentType !== 'text' && {
                fileName: fileName,
                fileSize: fileSize,
                fileType: fileType
            })
        })

        await message.save()

        // Update conversation
        conversation.lastMessage = message._id
        conversation.updatedAt = new Date()

        if (!conversation.unreadCounts) {
            conversation.unreadCounts = new Map()
        }

        // WhatsApp badge logic
        conversation.unreadCounts.set(senderId.toString(), 0)

        if (shouldShowBadge) {
            const currentReceiverCount = conversation.unreadCounts.get(receiverId.toString()) || 0
            conversation.unreadCounts.set(receiverId.toString(), currentReceiverCount + 1)
        } else {
            conversation.unreadCounts.set(receiverId.toString(), 0)
        }

        await conversation.save()

        // Populate message
        const populatedMessage = await Message.findById(message._id)
            .populate("sender", "username profilePicture")
            .populate("receiver", "username profilePicture")

        const responseMessage = {
            ...populatedMessage.toObject(),
            clientId: clientId || null,
            messageStatus: messageStatus,
            shouldShowBadge: shouldShowBadge // 🔴 IMPORTANT FOR FRONTEND
        }

        console.log("💾 Message saved:", {
            id: message._id,
            status: messageStatus,
            badge: shouldShowBadge
        })

        // 🔴 ⚡⚡⚡ ULTRA-INSTANT SOCKET EMISSIONS 

        if (io) {
            // 🔴 1) IMMEDIATE TO SENDER (50ms)
            setTimeout(() => {
                const senderMessageData = {
                    ...responseMessage,
                    conversationId: conversation._id,
                    isRealTime: true,
                    immediate: true,
                    timestamp: Date.now()
                }

                senderSocketIds.forEach(socketId => {
                    io.to(socketId).emit("receive_message", senderMessageData)

                    // Status update for sender
                    io.to(socketId).emit("message_status_update", {
                        messageId: message._id,
                        messageStatus: messageStatus,
                        conversationId: conversation._id,
                        immediate: true
                    })
                })

                console.log("📤 Sent to sender:", messageStatus)

            }, 50)

            // 🔴 2) INSTANT TO RECEIVER IF ONLINE (100ms)
            if (isReceiverOnline) {
                setTimeout(() => {
                    const receiverMessageData = {
                        ...responseMessage,
                        conversationId: conversation._id,
                        isRealTime: true,
                        immediate: true,
                        timestamp: Date.now()
                    }

                    receiverSocketIds.forEach(socketId => {
                        io.to(socketId).emit("receive_message", receiverMessageData)

                        // 🔔 BADGE ONLY IF NOT IN CHAT
                        if (shouldShowBadge && !isReceiverInThisChat) {
                            io.to(socketId).emit("instant_badge", {
                                conversationId: conversation._id,
                                badgeCount: conversation.unreadCounts.get(receiverId.toString()) || 1,
                                immediate: true
                            })
                        }
                    })

                    console.log("📤 Sent to receiver, badge:", shouldShowBadge)

                }, 100)
            }

            // 🔴 3) CONVERSATION UPDATE FOR BOTH (100ms)
            setTimeout(async () => {
                const updatedConv = await Conversation.findById(conversation._id)
                    .populate("participants", "username profilePicture lastSeen isOnline")
                    .populate({
                        path: "lastMessage",
                        populate: [
                            { path: "sender", select: "username profilePicture" },
                            { path: "receiver", select: "username profilePicture" }
                        ]
                    })

                const convData = {
                    ...updatedConv.toObject(),
                    unreadCounts: Object.fromEntries(updatedConv.unreadCounts || new Map()),
                    immediate: true,
                    timestamp: Date.now()
                }

                // Emit to both users
                const allUserIds = [senderId.toString(), receiverId.toString()]
                allUserIds.forEach(userId => {
                    const userSockets = socketUserMap.get(userId)
                    if (userSockets) {
                        userSockets.forEach(socketId => {
                            io.to(socketId).emit("conversation_updated", convData)
                        })
                    }
                })

                // Global chat list update
                io.emit("new_message_event", {
                    conversationId: conversation._id,
                    message: responseMessage,
                    unreadCounts: Object.fromEntries(updatedConv.unreadCounts || new Map()),
                    immediate: true
                })

                console.log("🔄 Conversation updated for both")

            }, 100)
        }

        console.log("✅✅✅ MESSAGE SENT COMPLETE - WhatsApp logic applied")
        return response(res, 201, true, "Message sent", responseMessage)

    } catch (error) {
        console.error("❌❌❌ SEND ERROR:", error)
        return response(res, 500, false, "Server error: " + error.message)
    }
}

//! =============================================================================================================
//^ 2️⃣) GET ALL CONVERSATIONS --------->
const getConversation = async (req, res) => {
    const userId = req.user.userId;
    try {
        // 🔥 NEW HELPER: Fix Cloudinary profile picture URLs
        const fixProfilePictureUrl = (profilePic) => {
            if (!profilePic || typeof profilePic !== 'string') {
                return `https://ui-avatars.com/api/?name=User&background=random&color=fff`;
            }

            // If it's a Cloudinary URL
            if (profilePic.includes('cloudinary') && profilePic.includes('/v')) {
                // Remove version number and ensure proper format
                let fixedUrl = profilePic.replace(/\/v\d+\//, '/');

                // Also fix: /image/upload/v1768419715/ → /image/upload/
                fixedUrl = fixedUrl.replace(/\/image\/upload\/v\d+\//, '/image/upload/');

                // Ensure no broken URLs
                if (fixedUrl.includes('res.cloudinary.com//')) {
                    fixedUrl = fixedUrl.replace('res.cloudinary.com//', 'res.cloudinary.com/');
                }

                return fixedUrl;
            }

            return profilePic;
        };

        // 🔥 Fetch conversations with proper last message filtering
        let conversations = await Conversation.find({
            participants: userId
        })
            .populate("participants", "username profilePicture lastSeen isOnline")
            .populate({
                path: "lastMessage",
                populate: [
                    { path: "sender", select: "username profilePicture" },
                    { path: "receiver", select: "username profilePicture" }
                ]
            })
            .sort({ updatedAt: -1 });

        // 🔥 Process each conversation to get correct last message for this user
        conversations = await Promise.all(conversations.map(async (conv) => {
            const convObj = conv.toObject();

            // 🔥 Fix participants' profile pictures
            if (convObj.participants && Array.isArray(convObj.participants)) {
                convObj.participants = convObj.participants.map(participant => ({
                    ...participant,
                    profilePicture: fixProfilePictureUrl(participant.profilePicture)
                }));
            }

            // 🔥 CRITICAL: Find actual last message NOT deleted by this user
            let actualLastMessage = null;

            // First check if current lastMessage is deleted for this user
            const lastMsgDeleted = convObj.lastMessage &&
                convObj.lastMessage.deletedFor &&
                Array.isArray(convObj.lastMessage.deletedFor) &&
                convObj.lastMessage.deletedFor.includes(userId);

            if (lastMsgDeleted) {
                // Find the most recent message NOT deleted by this user
                actualLastMessage = await Message.findOne({
                    conversation: conv._id,
                    deletedFor: { $nin: [userId] }
                })
                    .sort({ createdAt: -1 })
                    .populate("sender", "username profilePicture")
                    .populate("receiver", "username profilePicture")
                    .lean();

                // Fix profile pictures in the found message
                if (actualLastMessage) {
                    if (actualLastMessage.sender) {
                        actualLastMessage.sender = {
                            ...actualLastMessage.sender,
                            profilePicture: fixProfilePictureUrl(actualLastMessage.sender?.profilePicture)
                        };
                    }
                    if (actualLastMessage.receiver) {
                        actualLastMessage.receiver = {
                            ...actualLastMessage.receiver,
                            profilePicture: fixProfilePictureUrl(actualLastMessage.receiver?.profilePicture)
                        };
                    }
                }
            } else {
                // Current lastMessage is fine
                if (convObj.lastMessage) {
                    // Fix profile pictures
                    if (convObj.lastMessage.sender) {
                        convObj.lastMessage.sender = {
                            ...convObj.lastMessage.sender,
                            profilePicture: fixProfilePictureUrl(convObj.lastMessage.sender?.profilePicture)
                        };
                    }
                    if (convObj.lastMessage.receiver) {
                        convObj.lastMessage.receiver = {
                            ...convObj.lastMessage.receiver,
                            profilePicture: fixProfilePictureUrl(convObj.lastMessage.receiver?.profilePicture)
                        };
                    }
                    actualLastMessage = convObj.lastMessage;
                }
            }

            // Handle unreadCounts conversion safely
            let unreadCountsObj = {};
            if (conv.unreadCounts instanceof Map) {
                unreadCountsObj = Object.fromEntries(conv.unreadCounts);
            } else if (conv.unreadCounts) {
                unreadCountsObj = conv.unreadCounts;
            }

            // Calculate user's unread count
            const userUnreadCount = unreadCountsObj[userId] || 0;

            return {
                ...convObj,
                lastMessage: actualLastMessage, // 🔴 This is the correct last message for this user
                unreadCounts: unreadCountsObj,
                userUnreadCount: userUnreadCount
            };
        }));

        return response(res, 200, true, "Conversation get successfully", conversations);
    } catch (error) {
        console.log("Get Conversation Error:", error);
        return response(res, 500, false, "Internal Server Error");
    }
}

//! =============================================================================================================
//^ 3️⃣) GET MESSAGES FROM A SPECIFIC CHAT CONVERSATION --------->
const getMessages = async (req, res) => {
    const { conversationId } = req.params
    const userId = req.user.userId

    try {
        // Find the conversation
        let conversation = await Conversation.findById(conversationId)
        if (!conversation) {
            return response(res, 404, false, "Conversation Not Found")
        }

        // Check authorization
        const participantIds = conversation.participants.map(id => id.toString())
        if (!participantIds.includes(userId)) {
            return response(res, 403, false, "Not authorized to view this conversation")
        }

        // Get messages
        const allMessages = await Message.find({
            conversation: conversationId,
            $or: [
                { sender: userId },
                { receiver: userId }
            ]
        })
            .populate("sender", "username profilePicture")
            .populate("receiver", "username profilePicture")
            .sort({ createdAt: 1 })

        // Filter messages deleted by this user
        const messages = allMessages.filter(message => {
            if (!message.deletedFor || !Array.isArray(message.deletedFor)) {
                return true
            }
            return !message.deletedFor.some(id =>
                id.toString() === userId.toString()
            )
        })

        console.log(`📨 Filtered ${messages.length} messages for user ${userId}`)

        // Mark messages as 'read' for this user
        await Message.updateMany(
            {
                conversation: conversationId,
                receiver: userId,
                messageStatus: { $in: ["sent", "delivered"] }
            },
            {
                $set: { messageStatus: "read" }
            }
        )

        // Reset unread count for this user in this conversation
        conversation.unreadCounts.set(userId, 0)
        conversation.updatedAt = new Date()
        await conversation.save()

        // Emit socket event for read receipts
        if (req.io && req.socketUserMap) {
            // Get the other participant
            const otherParticipantId = participantIds.find(id => id !== userId)
            if (otherParticipantId) {
                const otherParticipantSocketId = req.socketUserMap.get(otherParticipantId)
                if (otherParticipantSocketId) {
                    req.io.to(otherParticipantSocketId).emit("messages_read", {
                        conversationId: conversationId,
                        readerId: userId,
                        immediate: true
                    })
                }
            }
        }

        // Convert conversation for response
        const conversationData = {
            ...conversation.toObject(),
            unreadCounts: Object.fromEntries(conversation.unreadCounts || new Map())
        }

        return response(res, 200, true, "Message Retrieved Successfully", {
            messages,
            conversation: conversationData
        })
    } catch (error) {
        console.log("❌❌❌ Get Messages Error:", error)
        return response(res, 500, false, "Internal Server Error: " + error.message)
    }
}

//! =============================================================================================================
//^ 4️⃣) MARK AS READ --------->
const markAsRead = async (req, res) => {
    const { messageIds } = req.body
    const userId = req.user.userId

    try {
        // Get messages to determine conversations and senders
        const messages = await Message.find({
            _id: { $in: messageIds },
            $or: [
                { receiver: userId },
                { sender: userId }
            ]
        })

        if (messages.length === 0) {
            return response(res, 404, false, "No messages found")
        }

        // Update message status to "read"
        await Message.updateMany(
            {
                _id: { $in: messageIds },
                $or: [
                    { receiver: userId },
                    { sender: userId }
                ]
            },
            {
                $set: { messageStatus: "read" }
            }
        )

        // EMIT SOCKET EVENTS for real-time updates
        if (req.io && req.socketUserMap) {
            // Group messages by conversation and sender
            const updatesBySender = {}

            messages.forEach(message => {
                const senderId = message.sender.toString()
                const conversationId = message.conversation.toString()

                if (!updatesBySender[senderId]) {
                    updatesBySender[senderId] = {}
                }
                if (!updatesBySender[senderId][conversationId]) {
                    updatesBySender[senderId][conversationId] = []
                }
                updatesBySender[senderId][conversationId].push(message._id)
            })

            // Emit events to each sender
            for (const [senderId, conversations] of Object.entries(updatesBySender)) {
                const senderSocketId = req.socketUserMap.get(senderId)
                if (senderSocketId) {
                    for (const [conversationId, msgIds] of Object.entries(conversations)) {
                        req.io.to(senderSocketId).emit("message_read", {
                            messageIds: msgIds,
                            conversationId: conversationId,
                            readerId: userId
                        })

                        req.io.to(senderSocketId).emit("message_status_update", {
                            messageIds: msgIds,
                            messageStatus: "read",
                            conversationId: conversationId
                        })
                    }
                }
            }
        }

        return response(res, 200, true, "Messages are marked as read", { updatedCount: messages.length })
    } catch (error) {
        console.log("Mark as Read Error:", error)
        return response(res, 500, false, "Internal Server Error")
    }
}

//! =============================================================================================================
//^ 5️⃣) MESSAGE DELETED - INSTANT REAL-TIME --------->
const deleteMessage = async (req, res) => {
    const { messageId } = req.params
    const { deleteForEveryone = false } = req.body
    const userId = req.user.userId

    try {
        const message = await Message.findById(messageId)
        if (!message) {
            return response(res, 404, false, "Message Not Found")
        }

        // Check authorization
        const isSender = message.sender.toString() === userId
        const isReceiver = message.receiver.toString() === userId

        if (!isSender && !isReceiver) {
            return response(res, 403, false, "Not authorized to delete this message")
        }

        const conversationId = message.conversation
        const senderId = message.sender.toString()
        const receiverId = message.receiver.toString()

        console.log("🗑️ DELETE REQUEST:", {
            messageId,
            userId,
            isSender,
            isReceiver,
            deleteForEveryone
        })

        // 🔴 DELETE FOR EVERYONE
        if (deleteForEveryone && isSender) {
            console.log(`🗑️ Sender deleting for everyone`)

            // Delete from Cloudinary
            if (message.publicId) {
                try {
                    await deleteFromCloudinary(message.publicId, message.contentType)
                } catch (error) {
                    console.error("❌ Cloudinary delete error:", error)
                }
            }

            // Delete from database
            await message.deleteOne()

            // Find new last message for everyone
            const lastMsg = await Message.findOne({ conversation: conversationId })
                .sort({ createdAt: -1 })
                .limit(1)

            // Update conversation
            const conversation = await Conversation.findById(conversationId)
            if (conversation) {
                conversation.lastMessage = lastMsg ? lastMsg._id : null
                if (lastMsg) {
                    conversation.updatedAt = lastMsg.createdAt;
                } else {
                    // If no messages left, reset updatedAt to conversation creation time
                    conversation.updatedAt = conversation.createdAt;
                }
                await conversation.save()
            }

            // 🔴 SOCKET EMIT FOR BOTH
            if (req.io) {
                const updatedConversation = await Conversation.findById(conversationId)
                    .populate("participants", "username profilePicture lastSeen isOnline")
                    .populate({
                        path: "lastMessage",
                        populate: [
                            { path: "sender", select: "username profilePicture" },
                            { path: "receiver", select: "username profilePicture" }
                        ]
                    })

                const conversationData = {
                    ...updatedConversation.toObject(),
                    unreadCounts: Object.fromEntries(updatedConversation.unreadCounts || new Map())
                }

                // Send to both users
                req.io.emit("message_deleted_instant", {
                    messageId: messageId,
                    conversationId: conversationId,
                    deletedForEveryone: true,
                    targetUserId: senderId
                })

                req.io.emit("conversation_updated_instant", {
                    ...conversationData,
                    targetUserId: senderId
                })

                req.io.emit("message_deleted_instant", {
                    messageId: messageId,
                    conversationId: conversationId,
                    deletedForEveryone: true,
                    targetUserId: receiverId
                })

                req.io.emit("conversation_updated_instant", {
                    ...conversationData,
                    targetUserId: receiverId
                })
            }

            return response(res, 200, true, "Message deleted for everyone")

        } else {
            // 🔴 DELETE FOR ME ONLY
            console.log(`🗑️ User deleting for themselves (${isSender ? 'sender' : 'receiver'})`)

            // Mark message as deleted for this user
            if (!message.deletedFor) {
                message.deletedFor = []
            }
            if (!message.deletedFor.includes(userId)) {
                message.deletedFor.push(userId)
                await message.save()
            }

            // 🔴 SIMPLE LOGIC: Find the actual last message NOT deleted by this user
            const actualLastMsg = await Message.findOne({
                conversation: conversationId,
                deletedFor: { $nin: [userId] } // Not deleted by this user
            })
                .sort({ createdAt: -1 })
                .limit(1)
                .populate("sender", "username profilePicture")
                .populate("receiver", "username profilePicture")

            // Get conversation
            const conversation = await Conversation.findById(conversationId)
                .populate("participants", "username profilePicture lastSeen isOnline")
                .populate({
                    path: "lastMessage",
                    populate: [
                        { path: "sender", select: "username profilePicture" },
                        { path: "receiver", select: "username profilePicture" }
                    ]
                })

            // 🔴 SEND TO DELETER ONLY
            if (req.io) {
                // If there's a non-deleted message, send it
                if (actualLastMsg) {
                    const conversationData = {
                        ...conversation.toObject(),
                        lastMessage: actualLastMsg,
                        unreadCounts: Object.fromEntries(conversation.unreadCounts || new Map())
                    }

                    req.io.emit("conversation_updated_instant", {
                        ...conversationData,
                        targetUserId: userId
                    })
                } else {
                    // No messages left for this user - remove conversation from list
                    req.io.emit("conversation_removed_instant", {
                        conversationId: conversationId,
                        targetUserId: userId
                    })
                }

                req.io.emit("message_deleted_instant", {
                    messageId: messageId,
                    conversationId: conversationId,
                    deletedForEveryone: false,
                    deletedForMe: true,
                    targetUserId: userId
                })
            }

            return response(res, 200, true, "Message deleted for you")
        }

    } catch (error) {
        console.log("❌ Delete Message Error:", error)
        return response(res, 500, false, "Internal Server Error")
    }
}


//! =============================================================================================================
//^ 6️⃣) CLEAR CHAT FOR USER (DELETE ALL MESSAGES FOR ME ONLY)
//! =============================================================================================================
const clearChat = async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    try {
        // 1. Verify conversation exists
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return response(res, 404, false, "Conversation not found");
        }

        // 2. Check if user is a participant
        if (!conversation.participants.some(id => id.toString() === userId)) {
            return response(res, 403, false, "Not authorized");
        }

        // 3. Mark all messages in this conversation as deleted for this user
        const result = await Message.updateMany(
            { conversation: conversationId },
            { $addToSet: { deletedFor: userId } }   // add userId if not already present
        );

        console.log(`🧹 Cleared ${result.modifiedCount} messages for user ${userId} in conversation ${conversationId}`);

        // 4. Reset unread count for this user
        conversation.unreadCounts.set(userId, 0);
        conversation.updatedAt = new Date();
        await conversation.save();

        // 5. (Optional) Notify the user via socket for instant UI update
        if (req.io && req.socketUserMap) {
            const userSockets = req.socketUserMap.get(userId);
            if (userSockets) {
                userSockets.forEach(socketId => {
                    req.io.to(socketId).emit("chat_cleared", {
                        conversationId: conversationId
                    });
                });
            }
        }

        return response(res, 200, true, "Chat cleared successfully");
    } catch (error) {
        console.error("❌ Clear chat error:", error);
        return response(res, 500, false, "Internal Server Error");
    }
}


export { sendMessage, getConversation, getMessages, markAsRead, deleteMessage, clearChat }