import { create } from "zustand";
import {
    getSocket, emitReaction, emitMessageRead, joinConversationRoom, leaveConversationRoom,
    emitEnterChatWindow, emitLeaveChatWindow, getImmediateStatus
} from "../services/chat.service";
import axiosInstance from "../services/url.service";

import useLayoutStore from './useLayoutStore'

const sortConversations = (data) => {
    if (!data) return [];
    return [...data].sort((a, b) => {
        // Strict WhatsApp Logic: Use the timestamp of the actual message content
        const timeA = a.lastMessage?.createdAt
            ? new Date(a.lastMessage.createdAt).getTime()
            : new Date(a.updatedAt || 0).getTime();

        const timeB = b.lastMessage?.createdAt
            ? new Date(b.lastMessage.createdAt).getTime()
            : new Date(b.updatedAt || 0).getTime();

        return timeB - timeA;  // Latest on top
    });
};


export const useChatStore = create((set, get) => ({
    conversations: null,
    currentConversation: null,
    messages: {},
    loading: false,
    error: null,
    currentUser: null,
    onlineUsers: new Map(), // 🔴 REAL-TIME ONLINE STATUS
    typingUsers: new Map(),
    socketInitialized: false,
    socketListenersSet: false,
    chatListTyping: new Map(),
    pendingMessages: new Map(),
    unreadCounts: new Map(),
    activeChatWindows: new Set(),
    // 🔴 NEW: contacts list (users without a conversation yet)
    contacts: [],   // array of user objects


    // 🎯 INITIALIZE SOCKET LISTENERS
    initSocketListeners: () => {
        const { socketListenersSet } = get()
        if (socketListenersSet) return

        const socket = getSocket()
        if (!socket || !socket.connected) {
            console.warn("Socket not connected, cannot init listeners")
            return
        }

        // 🔴 CLEAN UP OLD LISTENERS
        socket.off("receive_message")
        socket.off("user_typing")
        socket.off("user_status")
        socket.off("message_status_update")
        socket.off("message_error")
        socket.off("message_deleted_instant")
        socket.off("conversation_updated_instant")
        socket.off("message_deleted")
        socket.off("conversation_updated")
        socket.off("chat_list_update")
        socket.off("reactions_update")
        socket.off("messages_read")
        socket.off("user_reading_messages")
        socket.off("contact_online")
        socket.off("user_online")
        socket.off("global_user_status")
        socket.off("force_conversation_update") // 🔴 NEW



        // 🎯 [1] WHATSAPP-STYLE INSTANT MESSAGE
        socket.on("receive_message", (message) => {
            console.log("📨 WHATSAPP MESSAGE:", {
                id: message._id,
                from: message.sender?.username,
                status: message.messageStatus,
                badge: message.shouldShowBadge,
                immediate: message.immediate
            })

            const { currentUser, currentConversation } = get()
            const conversationId = message.conversationId || message.conversation

            if (!conversationId) return

            // 🔴 INSTANT UPDATE (NO DELAY)
            set((state) => {
                const existingMessages = state.messages[conversationId] || []

                // Check for duplicate
                const exists = existingMessages.some(msg =>
                    msg._id === message._id || msg.clientId === message.clientId
                )

                if (!exists) {
                    const newMessages = [...existingMessages, message]

                    // Sort by time
                    newMessages.sort((a, b) =>
                        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    )

                    // 🔴 WHATSAPP LOGIC: Update unread count
                    let newUnreadCounts = new Map(state.unreadCounts)
                    const isReceiver = message.receiver?._id === currentUser?._id
                    const isInChatWindow = state.currentConversation === conversationId

                    if (isReceiver && !isInChatWindow && message.shouldShowBadge) {
                        const currentCount = newUnreadCounts.get(conversationId) || 0
                        newUnreadCounts.set(conversationId, currentCount + 1)
                        console.log(`🔔 Badge updated: ${conversationId} = ${currentCount + 1}`)
                    }

                    // If in chat window, clear badge
                    if (isReceiver && isInChatWindow) {
                        newUnreadCounts.set(conversationId, 0)
                    }

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: newMessages
                        },
                        unreadCounts: newUnreadCounts
                    }
                }

                return state
            })

            // 🔴 INSTANT CONVERSATION UPDATE
            get().updateConversationOnNewMessage(message)

            // 🔴 MARK AS READ IF IN CURRENT CHAT (WHATSAPP BLUE TICK)
            if (currentConversation === conversationId &&
                message.receiver?._id === currentUser?._id) {

                // Immediate blue tick
                setTimeout(() => {
                    get().markMessageAsRead(conversationId, [message._id])
                }, 100)
            }
        })


        // 🎯 [2] USER STATUS - REAL-TIME
        socket.on("user_status", ({ userId, isOnline, lastSeen, logout, immediate }) => {
            console.log("👤 User status update (real-time):", { userId, isOnline, immediate })

            set((state) => {
                const newOnlineUsers = new Map(state.onlineUsers)

                if (logout) {
                    newOnlineUsers.delete(userId)
                } else {
                    newOnlineUsers.set(userId, {
                        isOnline: !!isOnline,
                        lastSeen: lastSeen ? new Date(lastSeen) : new Date(),
                        timestamp: Date.now(),
                        immediate: immediate
                    })
                }

                return {
                    onlineUsers: newOnlineUsers
                }
            })
        })

        // 🎯 [3] CONTACT ONLINE - INSTANT UPDATE
        socket.on("contact_online", ({ userId, isOnline, lastSeen, immediate }) => {
            console.log("👤 Contact online (instant):", { userId, isOnline, immediate })

            set((state) => {
                const newOnlineUsers = new Map(state.onlineUsers)
                newOnlineUsers.set(userId, {
                    isOnline: true,
                    lastSeen: new Date(lastSeen),
                    timestamp: Date.now(),
                    immediate: true
                })

                return {
                    onlineUsers: newOnlineUsers
                }
            })
        })

        // 🎯 [4] GLOBAL USER STATUS
        socket.on("global_user_status", ({ userId, isOnline, lastSeen }) => {
            set((state) => {
                const newOnlineUsers = new Map(state.onlineUsers)
                newOnlineUsers.set(userId, {
                    isOnline: isOnline,
                    lastSeen: new Date(lastSeen),
                    timestamp: Date.now()
                })

                return {
                    onlineUsers: newOnlineUsers
                }
            })
        })

        // 🎯 [5] USER ONLINE
        socket.on("user_online", ({ userId, isOnline }) => {
            set((state) => {
                const newOnlineUsers = new Map(state.onlineUsers)
                newOnlineUsers.set(userId, {
                    isOnline: true,
                    lastSeen: new Date(),
                    timestamp: Date.now(),
                    immediate: true
                })

                return {
                    onlineUsers: newOnlineUsers
                }
            })
        })

        // 🎯 [6] MESSAGE STATUS UPDATES within 1 sec
        socket.on("message_status_update", ({ messageId, messageStatus, conversationId, immediate }) => {
            if (!immediate || !conversationId) return

            console.log("📡 INSTANT STATUS UPDATE:", { messageId, messageStatus, conversationId })

            set((state) => {
                const conversationMessages = state.messages[conversationId] || []
                const updatedMessages = conversationMessages.map((msg) =>
                    msg._id === messageId || msg.clientId === messageId
                        ? { ...msg, messageStatus }
                        : msg
                )

                return {
                    messages: {
                        ...state.messages,
                        [conversationId]: updatedMessages
                    }
                }
            })
        })

        // 🎯 [7] REACTIONS - INSTANT
        socket.on("reactions_update", ({ messageId, reactions, conversationId }) => {
            console.log("🎯 Reactions update (real-time):", { messageId, conversationId })

            set((state) => {
                if (!conversationId) return state

                const conversationMessages = state.messages[conversationId] || []
                const updatedMessages = conversationMessages.map((msg) => {
                    if (msg._id !== messageId) return msg
                    return {
                        ...msg,
                        reactions: Array.isArray(reactions) ? reactions : []
                    }
                })

                return {
                    messages: {
                        ...state.messages,
                        [conversationId]: updatedMessages
                    }
                }
            })
        })

        // 🎯 [8] MESSAGE DELETED - INSTANT UPDATE FOR BOTH
        socket.on("message_deleted", ({ messageId, conversationId, deletedForEveryone, deletedForMe }) => {
            console.log("🗑️ REAL-TIME MESSAGE DELETE:", {
                messageId,
                conversationId,
                deletedForEveryone,
                deletedForMe
            })

            // 🔴 INSTANTLY REMOVE FROM MESSAGES
            set((state) => {
                let updatedMessages = { ...state.messages }

                // Remove from messages
                if (updatedMessages[conversationId]) {
                    updatedMessages[conversationId] = updatedMessages[conversationId].filter(
                        msg => msg._id !== messageId
                    )
                }

                return {
                    messages: updatedMessages
                }
            })

            // 🔴 IMMEDIATELY REFETCH CONVERSATIONS FOR CHAT LIST UPDATE (0.7-1 sec)
            setTimeout(() => {
                get().fetchConversations()
            }, 700) // 0.7 seconds delay
        }),


            // 🎯 [9] USER TYPING
            socket.on("user_typing", ({ userId, conversationId, isTyping, location = "both" }) => {
                console.log("⌨️ User typing:", { userId, conversationId, isTyping, location })

                set((state) => {
                    const newTypingUsers = new Map(state.typingUsers)
                    const newChatListTyping = new Map(state.chatListTyping)

                    // Chat window typing
                    if (location === "both" || location === "chat") {
                        if (!newTypingUsers.has(conversationId)) {
                            newTypingUsers.set(conversationId, new Set())
                        }

                        const typingSet = newTypingUsers.get(conversationId)
                        if (isTyping) {
                            typingSet.add(userId)
                        } else {
                            typingSet.delete(userId)
                        }

                        if (typingSet.size === 0) {
                            newTypingUsers.delete(conversationId)
                        } else {
                            newTypingUsers.set(conversationId, typingSet)
                        }
                    }

                    // Chat list typing
                    if (location === "both" || location === "list") {
                        if (isTyping) {
                            newChatListTyping.set(conversationId, {
                                userId,
                                timestamp: Date.now()
                            })
                        } else {
                            newChatListTyping.delete(conversationId)
                        }
                    }

                    return {
                        typingUsers: newTypingUsers,
                        chatListTyping: newChatListTyping
                    }
                })
            })

        // 🎯 [10] INSTANT CONVERSATION UPDATE (ADD THIS)
        socket.on("conversation_updated", (conversation) => {
            if (!conversation?._id) return

            console.log("🔄 INSTANT CONVERSATION UPDATE:", conversation._id)

            // Immediate update
            get().updateConversationInList(conversation)
        })

        // 🔴 [11] INSTANT MESSAGE DELETE (WITHIN 1 SEC)
        socket.on("message_deleted_instant", ({ messageId, conversationId, deletedForEveryone, deletedForMe, targetUserId }) => {
            const { currentUser } = get()

            if (targetUserId && targetUserId !== currentUser?._id) {
                return
            }

            console.log("⚡ INSTANT MESSAGE DELETE:", {
                messageId,
                conversationId,
                deletedForMe,
                deletedForEveryone,
                forUser: currentUser?._id
            })

            set(state => {
                const updatedMessages = { ...state.messages }

                // Remove from messages
                if (updatedMessages[conversationId]) {
                    updatedMessages[conversationId] = updatedMessages[conversationId].filter(
                        msg => msg._id !== messageId
                    )
                }

                // 🔴 FOR "DELETE FOR ME": PROPER CHATLIST UPDATE
                if (deletedForMe && !deletedForEveryone) {
                    if (!state.conversations?.data) return { messages: updatedMessages }

                    const updatedConversations = [...state.conversations.data]
                    const convIndex = updatedConversations.findIndex(c => c._id === conversationId)

                    if (convIndex >= 0) {
                        // Get remaining messages after deletion
                        const remainingMsgs = updatedMessages[conversationId] || []

                        // Find the actual last message (not deleted for this user)
                        let actualLastMessage = null

                        if (remainingMsgs.length > 0) {
                            // Sort by time and get most recent
                            const sorted = [...remainingMsgs].sort((a, b) =>
                                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                            )

                            // Find first message that's not deleted for this user
                            for (const msg of sorted) {
                                if (!msg.deletedFor || !msg.deletedFor.includes(currentUser?._id)) {
                                    actualLastMessage = msg
                                    break
                                }
                            }
                        }

                        // Update conversation in list
                        updatedConversations[convIndex] = {
                            ...updatedConversations[convIndex],
                            lastMessage: actualLastMessage || updatedConversations[convIndex].lastMessage,
                            updatedAt: new Date().toISOString(),
                            unreadCounts: {
                                ...updatedConversations[convIndex].unreadCounts,
                                [currentUser?._id]: 0
                            }
                        }

                        // Sort by updated time
                        updatedConversations.sort((a, b) =>
                            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                        )

                        // Update unread counts in store too
                        const newUnreadCounts = new Map(state.unreadCounts)
                        newUnreadCounts.set(conversationId, 0)

                        return {
                            messages: updatedMessages,
                            conversations: {
                                ...state.conversations,
                                data: updatedConversations
                            },
                            unreadCounts: newUnreadCounts
                        }
                    }
                }

                return {
                    messages: updatedMessages
                }
            })
        })

        // 🔴 [12] INSTANT CONVERSATION UPDATE (WITHIN 1 SEC)
        socket.on("conversation_updated_instant", ({ targetUserId, ...conversation }) => {
            const { currentUser } = get()

            // Check if this update is for current user
            if (targetUserId && targetUserId !== currentUser?._id) {
                return // Not for this user
            }

            console.log("🔄 INSTANT CONVERSATION UPDATE FOR USER:", currentUser?._id)

            // 🔴 CRITICAL FIX: Check if last message is deleted for current user
            let lastMessage = conversation.lastMessage
            if (lastMessage &&
                lastMessage.deletedFor &&
                Array.isArray(lastMessage.deletedFor) &&
                lastMessage.deletedFor.includes(currentUser?._id)) {

                // If last message is deleted for current user, don't update chat list with it
                console.log("🚫 Last message deleted for current user, skipping update")
                return
            }

            // INSTANTLY UPDATE CHAT LIST
            set((state) => {
                if (!state.conversations?.data) return state

                const updatedConversations = [...state.conversations.data]
                const existingIndex = updatedConversations.findIndex(
                    conv => conv._id === conversation._id
                )

                if (existingIndex >= 0) {
                    // Update existing conversation
                    updatedConversations[existingIndex] = {
                        ...updatedConversations[existingIndex],
                        lastMessage: conversation.lastMessage,
                        updatedAt: conversation.updatedAt || new Date().toISOString()
                    }

                    // Move to top (WhatsApp style)
                    const [movedConv] = updatedConversations.splice(existingIndex, 1)
                    updatedConversations.unshift(movedConv)
                } else {
                    // Add new conversation
                    updatedConversations.unshift(conversation)
                }

                return {
                    conversations: {
                        ...state.conversations,
                        data: updatedConversations
                    }
                }
            })
        })

        // 🎯 [13] INSTANT CHAT LIST UPDATE
        socket.on("instant_chatlist_update", ({ conversationId, lastMessage, unreadCounts, immediate }) => {
            if (!conversationId || !immediate) return

            console.log("📋 INSTANT CHAT LIST UPDATE:", conversationId)

            // Update unread counts
            if (unreadCounts) {
                set(state => {
                    const newUnreadCounts = new Map(state.unreadCounts)
                    Object.entries(unreadCounts).forEach(([convId, count]) => {
                        newUnreadCounts.set(convId, count)
                    })
                    return { unreadCounts: newUnreadCounts }
                })
            }

            // Force conversation fetch
            get().fetchConversations()
        })

        // 🎯 [14] MESSAGES READ
        socket.on("messages_read", ({ messageIds, conversationId, readerId }) => {
            console.log("👀 Messages read:", { conversationId, readerId })

            const { currentUser } = get()

            if (currentUser?._id !== readerId && conversationId) {
                set((state) => {
                    const conversationMessages = state.messages[conversationId] || []
                    const updatedMessages = conversationMessages.map((msg) =>
                        messageIds.includes(msg._id)
                            ? { ...msg, messageStatus: "read" }
                            : msg
                    )

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: updatedMessages
                        }
                    }
                })
            }
        })

        // 🎯 [15] USER READING MESSAGES
        socket.on("user_reading_messages", ({ conversationId, readerId }) => {
            console.log("👤 User reading messages:", { conversationId, readerId })

            const { currentUser } = get()

            if (currentUser?._id !== readerId) {
                set((state) => {
                    const conversationMessages = state.messages[conversationId] || []
                    const updatedMessages = conversationMessages.map((msg) => {
                        if (msg.sender?._id === readerId && msg.receiver?._id === currentUser?._id) {
                            return { ...msg, messageStatus: "read" }
                        }
                        return msg
                    })

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: updatedMessages
                        }
                    }
                })
            }
        })

        // 🎯 [16] SOCKET HEALTH
        socket.on("connect_error", () => {
            console.warn("⚠️ Socket connection error")
        })


        // 🔴 [17] INSTANT MESSAGE DELIVERY SYSTEM
        socket.on("instant_message_delivery", async ({ senderId, receiverId, messageData }) => {
            try {
                const receiverSockets = userConnections.get(receiverId)
                const senderSockets = userConnections.get(senderId)

                // 🔴 STEP 1: Update message status based on receiver's online status
                let messageStatus = "sent"
                if (receiverSockets && receiverSockets.size > 0) {
                    messageStatus = "delivered"

                    // Update in database
                    await Message.findByIdAndUpdate(messageData._id, {
                        messageStatus: "delivered"
                    })
                    messageData.messageStatus = "delivered"
                }

                // 🔴 STEP 2: Emit to sender immediately (optimistic update)
                if (senderSockets) {
                    senderSockets.forEach((_, senderSocketId) => {
                        io.to(senderSocketId).emit("instant_message_receive", {
                            ...messageData,
                            messageStatus: messageStatus,
                            immediate: true
                        })
                    })
                }

                // 🔴 STEP 3: Emit to receiver immediately if online
                if (receiverSockets) {
                    receiverSockets.forEach((_, receiverSocketId) => {
                        io.to(receiverSocketId).emit("instant_message_receive", {
                            ...messageData,
                            messageStatus: "delivered",
                            immediate: true
                        })
                    })
                }

                // 🔴 STEP 4: Update status in real-time
                if (receiverSockets && receiverSockets.size > 0) {
                    const statusUpdate = {
                        messageId: messageData._id,
                        messageStatus: "delivered",
                        conversationId: messageData.conversationId || messageData.conversation
                    }

                    // Notify sender about delivery
                    if (senderSockets) {
                        senderSockets.forEach((_, senderSocketId) => {
                            io.to(senderSocketId).emit("message_status_update", statusUpdate)
                        })
                    }
                }

                console.log(`📨 INSTANT MESSAGE DELIVERY: ${senderId} -> ${receiverId}, Status: ${messageStatus}`)

            } catch (error) {
                console.error("❌ Error in instant_message_delivery:", error)
            }
        })


        // 🎯 [18] INSTANT MESSAGE RECEIVE (REAL-TIME)
        socket.on("instant_message_receive", (message) => {
            console.log("⚡ INSTANT MESSAGE RECEIVED:", {
                id: message._id,
                from: message.sender?.username,
                status: message.messageStatus,
                immediate: message.immediate
            })

            const { currentUser, currentConversation } = get()
            const conversationId = message.conversationId || message.conversation

            if (!conversationId) return

            // 🔴 INSTANT MESSAGE UPDATE (NO DELAY)
            set((state) => {
                const existingMessages = state.messages[conversationId] || []

                // Check for duplicate
                const exists = existingMessages.some(msg =>
                    msg._id === message._id ||
                    msg.clientId === message.clientId
                )

                if (!exists) {
                    const newMessages = [...existingMessages, message]

                    // Sort by time
                    newMessages.sort((a, b) =>
                        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    )

                    // Update unread count if user is NOT in this chat
                    let newUnreadCounts = new Map(state.unreadCounts)
                    const isViewingChat = state.currentConversation === conversationId

                    if (message.receiver?._id === currentUser?._id &&
                        message.messageStatus !== "read" &&
                        !isViewingChat) {

                        const currentCount = newUnreadCounts.get(conversationId) || 0
                        newUnreadCounts.set(conversationId, currentCount + 1)
                    }

                    return {
                        messages: {
                            ...state.messages,
                            [conversationId]: newMessages
                        },
                        unreadCounts: newUnreadCounts
                    }
                }

                return state
            })

            // 🔴 INSTANT CONVERSATION UPDATE
            get().updateConversationOnNewMessage(message)

            // 🔴 MARK AS READ IF IN CURRENT CHAT (IMMEDIATE BLUE TICK)
            if (currentConversation === conversationId &&
                message.receiver?._id === currentUser?._id &&
                message.messageStatus === "delivered") {

                // Mark as read immediately
                setTimeout(() => {
                    get().markMessageAsRead(conversationId, [message._id])
                }, 100)
            }
        })

        // 🔴 INSTANT MESSAGE SENT (ADD THIS)
        socket.on("message_sent_instant", ({ conversationId, messageId, senderId, receiverId, status, immediate }) => {
            if (!immediate) return

            console.log("⚡ INSTANT MESSAGE SENT BROADCAST:", { conversationId, messageId, status })

            // Update the store if this message is for current user
            const { currentUser } = get()

            if (currentUser?._id === receiverId || currentUser?._id === senderId) {
                // Force conversation update
                get().fetchConversations()
            }
        })


        // 🎯 [19] FORCE CONVERSATION UPDATE (NEW)
        socket.on("force_conversation_update", ({ conversationId }) => {
            console.log("🔄 FORCE updating conversation:", conversationId)

            // 🔴 IMMEDIATELY REFETCH CONVERSATIONS
            get().fetchConversations()

            // 🔴 ALSO REFETCH MESSAGES IF IN THAT CHAT
            if (get().currentConversation === conversationId) {
                setTimeout(() => {
                    get().fetchMessages(conversationId)
                }, 200)
            }
        })


        // 🎯 [20] REAL-TIME UPDATES (NEW USER, PROFILE, USERNAME)
        socket.on("USER_UPDATE_BROADCAST", (updatedUser) => {
            console.log("👤 Real-time profile/username update for:", updatedUser.username);

            // 1. Update conversations (participants array)
            set((state) => {
                const updatedConversationsData = state.conversations?.data?.map((conv) => {
                    // Check if this conversation involves the updated user
                    const hasUser = conv.participants?.some(p => p._id === updatedUser._id);
                    if (hasUser) {
                        return {
                            ...conv,
                            participants: conv.participants.map(p =>
                                p._id === updatedUser._id ? { ...p, ...updatedUser } : p
                            )
                        };
                    }
                    return conv;
                });

                // 2. Update contacts list
                const updatedContacts = state.contacts?.map(contact =>
                    contact._id === updatedUser._id ? { ...contact, ...updatedUser } : contact
                );

                return {
                    conversations: state.conversations
                        ? { ...state.conversations, data: updatedConversationsData }
                        : state.conversations,
                    contacts: updatedContacts || state.contacts,
                };
            });

            // 3. If this user is currently selected, update the header immediately
            const { selectedContact, setSelectedContact } = useLayoutStore.getState();
            if (selectedContact && selectedContact._id === updatedUser._id) {
                setSelectedContact({ ...selectedContact, ...updatedUser });
            }
        })

        // [21] নতুন ইউজার রেজিস্টার হলে লিস্টে অ্যাড করা (Scenario 1)
        socket.on("NEW_USER_REGISTERED", (newUser) => {
            set((state) => {
                const currentContacts = state.contacts || []; // safety fallback
                if (currentContacts.some(c => c._id === newUser._id)) return state;
                return { contacts: [...currentContacts, newUser] };
            });
        })


        // 🎯 [21] Reconnect 
        socket.on("reconnect", () => {
            console.log("✅ Socket reconnected")
            get().fetchConversations()
        })


        // 🎯 [22] INSTANT BADGE UPDATE
        socket.on("instant_badge", ({ conversationId, badgeCount, immediate }) => {
            if (!immediate) return

            console.log("🔔 INSTANT BADGE:", { conversationId, badgeCount })

            set(state => {
                const newUnreadCounts = new Map(state.unreadCounts)

                // Update badge count
                newUnreadCounts.set(conversationId, badgeCount)

                return {
                    unreadCounts: newUnreadCounts
                }
            })
        })

        // 🎯 [23] NEW MESSAGE EVENT (for chat list update)
        socket.on("new_message_event", ({ conversationId, message, unreadCounts, immediate }) => {
            if (!immediate) return

            console.log("📨 NEW MESSAGE EVENT FOR CHAT LIST:", conversationId)

            // Update unread counts
            if (unreadCounts) {
                set(state => {
                    const newUnreadCounts = new Map(state.unreadCounts)
                    Object.entries(unreadCounts).forEach(([convId, count]) => {
                        newUnreadCounts.set(convId, count)
                    })
                    return { unreadCounts: newUnreadCounts }
                })
            }

            // Force conversation fetch
            get().fetchConversations()
        })

        // 🎯 [24] BADGE CLEARED WHEN ENTERING CHAT
        socket.on("badge_cleared", ({ conversationId, userId, immediate }) => {
            if (!immediate) return

            const { currentUser } = get()

            // Only clear if it's for current user
            if (currentUser?._id === userId) {
                console.log("🧹 CLEARING BADGE FOR:", conversationId)

                set(state => {
                    const newUnreadCounts = new Map(state.unreadCounts)
                    newUnreadCounts.set(conversationId, 0)

                    return {
                        unreadCounts: newUnreadCounts
                    }
                })

                // Also update conversation in list
                set(state => {
                    if (!state.conversations?.data) return state

                    const updatedConversations = state.conversations.data.map(conv => {
                        if (conv._id === conversationId) {
                            return {
                                ...conv,
                                userUnreadCount: 0,
                                unreadCounts: {
                                    ...conv.unreadCounts,
                                    [currentUser._id]: 0
                                }
                            }
                        }
                        return conv
                    })

                    return {
                        conversations: {
                            ...state.conversations,
                            data: updatedConversations
                        }
                    }
                })
            }
        })

        // 🎯 [25] MESSAGE DELETED FOR ME - SPECIFIC HANDLER
        socket.on("message_deleted_for_me", ({ conversationId, deletedMessageId }) => {
            const { currentUser } = get()

            console.log("🗑️ MESSAGE DELETED FOR ME:", { conversationId, deletedMessageId })

            // 🔴 FORCE UPDATE OF CONVERSATION IN CHAT LIST
            set(state => {
                if (!state.conversations?.data) return state

                const updatedConversations = [...state.conversations.data]
                const convIndex = updatedConversations.findIndex(c => c._id === conversationId)

                if (convIndex >= 0) {
                    // Get remaining messages
                    const remainingMsgs = state.messages[conversationId] || []

                    // Filter out deleted messages for current user
                    const validMessages = remainingMsgs.filter(msg => {
                        if (!msg.deletedFor || !Array.isArray(msg.deletedFor)) return true
                        return !msg.deletedFor.includes(currentUser?._id)
                    })

                    // Get the most recent valid message
                    validMessages.sort((a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )

                    const actualLastMessage = validMessages[0] || null

                    // Update conversation in list
                    updatedConversations[convIndex] = {
                        ...updatedConversations[convIndex],
                        lastMessage: actualLastMessage,
                        updatedAt: new Date().toISOString(),
                        unreadCounts: {
                            ...updatedConversations[convIndex].unreadCounts,
                            [currentUser?._id]: 0
                        }
                    }

                    // Sort by updated time
                    updatedConversations.sort((a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    )

                    // Update unread counts
                    const newUnreadCounts = new Map(state.unreadCounts)
                    newUnreadCounts.set(conversationId, 0)

                    return {
                        conversations: {
                            ...state.conversations,
                            data: updatedConversations
                        },
                        unreadCounts: newUnreadCounts
                    }
                }

                return state
            })
        })

        // 🎯 [26]
        socket.on("chat_cleared", ({ conversationId }) => {
            console.log("🧹 Chat cleared event received:", conversationId);
            set(state => ({
                messages: {
                    ...state.messages,
                    [conversationId]: []
                }
            }));
            get().updateConversationInList({
                _id: conversationId,
                lastMessage: null,
                updatedAt: new Date().toISOString()
            });
        })


        // 🎯 [27] NEW USER REGISTERED – add to contacts globally
        socket.on("NEW_USER_REGISTERED", (newUser) => {
            console.log("✅ New user registered (global):", newUser.username);
            set((state) => {
                // Avoid duplicates
                if (state.contacts.some(u => u._id === newUser._id)) return state;
                return {
                    contacts: [...state.contacts, newUser]
                };
            });
        })



        set({
            socketListenersSet: true,
            socketInitialized: true
        })

        console.log("✅ Socket listeners initialized")
    },


    // 🎯 SET CURRENT USER
    setCurrentUser: (user) => {
        set({ currentUser: user })
    },

    // 🎯 FETCH CONVERSATIONS - OPTIMIZED
    fetchConversations: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await axiosInstance.get("/chat/conversations");
            const currentUserId = get().currentUser?._id;
            const unreadCounts = new Map();

            const transformedData = {
                ...data,
                data: sortConversations(data.data?.map(conversation => {
                    const userUnreadCount = conversation.unreadCounts?.[currentUserId] || 0;
                    unreadCounts.set(conversation._id, userUnreadCount);
                    return {
                        ...conversation,
                        userUnreadCount: userUnreadCount
                    };
                }))
            };

            set({
                conversations: transformedData,
                unreadCounts: unreadCounts,
                loading: false
            });

            get().initSocketListeners();
            return transformedData;
        } catch (error) {
            set({ error: error?.message, loading: false });
            return null;
        }
    },

    // 🎯 FETCH MESSAGES
    fetchMessages: async (conversationId) => {
        if (!conversationId) return

        set({ loading: true, error: null })

        if (conversationId.startsWith('temp-conv-')) {
            set({ loading: false })
            return []
        }

        // 🔴 ENTER CHAT WINDOW
        emitEnterChatWindow(conversationId)
        joinConversationRoom(conversationId)

        try {
            const { data } = await axiosInstance.get(`/chat/conversations/${conversationId}/messages`)

            const messageArray = data?.data?.messages || []
            const { currentUser } = get()

            const filteredMessages = messageArray.filter(msg =>
                msg.sender?._id === currentUser?._id ||
                msg.receiver?._id === currentUser?._id
            )

            set(state => ({
                messages: {
                    ...state.messages,
                    [conversationId]: filteredMessages
                },
                currentConversation: conversationId,
                activeChatWindows: new Set([...state.activeChatWindows, conversationId]),
                loading: false
            }))

            // 🔴 RESET UNREAD COUNT
            get().markMessageAsRead(conversationId)
            get().resetUnreadCount(conversationId)

            return filteredMessages
        } catch (error) {
            if (error.response?.status === 404) {
                set(state => ({
                    messages: {
                        ...state.messages,
                        [conversationId]: []
                    },
                    loading: false,
                    error: null
                }))
            } else {
                set({
                    error: error?.response?.data?.message || error?.message,
                    loading: false
                })
            }
            return []
        }
    },

    // 🎯 LEAVE CHAT WINDOW
    leaveChatWindow: (conversationId) => {
        if (!conversationId) return

        emitLeaveChatWindow(conversationId)
        leaveConversationRoom(conversationId)

        set(state => ({
            currentConversation: null,
            activeChatWindows: new Set([...state.activeChatWindows].filter(id => id !== conversationId))
        }))
    },

    // 🔴 SEND MESSAGE - OPTIMISTIC + REAL-TIME
    sendMessage: async (formData) => {
        try {
            const senderId = formData.get("senderId");
            const receiverId = formData.get("receiverId");
            const { conversations, currentUser } = get();
            const tempId = `temp_${Date.now()}`;
            const conversationId = conversations?.data?.find(conv =>
                conv.participants.some(p => p._id === receiverId)
            )?._id || `temp_conv_${Date.now()}`;

            // 1. OPTIMISTIC UPDATE
            set(state => {
                let updatedConversations = [...(state.conversations?.data || [])];
                const convIndex = updatedConversations.findIndex(c => c._id === conversationId);

                if (convIndex >= 0) {
                    updatedConversations[convIndex] = {
                        ...updatedConversations[convIndex],
                        updatedAt: new Date().toISOString(), // FORCE CURRENT TIME
                        lastMessage: { content: formData.get("content"), sender: { _id: senderId } }
                    };
                }
                return {
                    conversations: {
                        ...state.conversations,
                        data: sortConversations(updatedConversations) // SORT IMMEDIATELY
                    }
                };
            });

            // 2. BACKEND CALL
            const { data } = await axiosInstance.post("/chat/send-message", formData);
            const savedMessage = data.data || data;

            // 3. SYNC AFTER BACKEND RESPONSE
            set(state => {
                let updatedConversations = [...(state.conversations?.data || [])];
                const realConvId = savedMessage.conversation?._id || savedMessage.conversation;

                const index = updatedConversations.findIndex(c => c._id === conversationId || c._id === realConvId);

                if (index >= 0) {
                    updatedConversations[index] = {
                        ...updatedConversations[index],
                        _id: realConvId,
                        updatedAt: savedMessage.createdAt, // SYNC WITH SERVER TIME
                        lastMessage: savedMessage
                    };
                }
                return {
                    conversations: {
                        ...state.conversations,
                        data: sortConversations(updatedConversations)
                    }
                };
            });
        } catch (error) {
            console.error(error);
        }
    },

    // 🎯 GET MESSAGES FOR CONVERSATION
    getMessagesForConversation: (conversationId) => {
        return get().messages[conversationId] || []
    },

    // 🎯 CLEAR CONVERSATION MESSAGES
    clearConversationMessages: (conversationId) => {
        set(state => ({
            messages: {
                ...state.messages,
                [conversationId]: []
            }
        }))
    },

    // 🎯 UPDATE CONVERSATION ON NEW MESSAGE - REAL-TIME
    updateConversationOnNewMessage: (message) => {
        set((state) => {
            if (!state.conversations?.data) return state;

            const conversationId = message.conversationId || message.conversation;
            let updatedConversations = [...state.conversations.data];

            const index = updatedConversations.findIndex(c => String(c._id) === String(conversationId));

            if (index >= 0) {
                updatedConversations[index] = {
                    ...updatedConversations[index],
                    lastMessage: message,
                    updatedAt: message.createdAt || new Date().toISOString(), // Socket timestamp
                };
            } else {
                // New conversation logic
                updatedConversations.push({
                    _id: conversationId,
                    participants: [message.sender, message.receiver],
                    lastMessage: message,
                    updatedAt: message.createdAt || new Date().toISOString()
                });
            }

            return {
                conversations: {
                    ...state.conversations,
                    data: sortConversations(updatedConversations)
                }
            };
        });
    },

    // 🎯 STABLE CONVERSATION UPDATE (for external updates)
    updateConversationInList: (conversation) => {
        set((state) => {
            if (!state.conversations?.data) return state;

            const updatedData = [...state.conversations.data];
            const existingIndex = updatedData.findIndex(
                conv => String(conv._id) === String(conversation._id)
            );

            if (existingIndex >= 0) {
                // 🔴 UPDATE DATA ONLY, NO UNSHIFT
                updatedData[existingIndex] = {
                    ...updatedData[existingIndex],
                    ...conversation,
                    // Ensure we use the latest lastMessage from server
                    lastMessage: conversation.lastMessage || null
                };
            } else {
                updatedData.push(conversation);
            }

            // 🔴 CRITICAL: Resort the list based on Message Time, NOT array position
            return {
                conversations: {
                    ...state.conversations,
                    data: sortConversations(updatedData)
                }
            };
        });
    },

    // 🎯 UPDATE CHAT LIST ORDER
    updateChatListOrder: (conversationId) => {
        set((state) => {
            if (!state.conversations?.data) return state;

            // Don't unshift manually. Just trigger a re-sort by returning the data 
            // through the sortConversations utility.
            return {
                conversations: {
                    ...state.conversations,
                    data: sortConversations(state.conversations.data)
                }
            };
        });
    },

    // 🎯 MARK MESSAGE AS READ
    markMessageAsRead: async (conversationId, messageIds) => {
        const { messages, currentUser } = get()
        const conversationMessages = messages[conversationId] || []

        if (!conversationMessages.length || !currentUser) return

        // Determine which messages to mark as read
        const unreadIds = messageIds || conversationMessages
            .filter((msg) =>
                msg.messageStatus !== 'read' &&
                msg.receiver?._id === currentUser?._id
            )
            .map((msg) => msg._id)
            .filter(Boolean)

        if (unreadIds.length === 0) return

        try {
            await axiosInstance.put("/chat/messages/read", { messageIds: unreadIds })

            set((state) => {
                const conversationMessages = state.messages[conversationId] || []
                const updatedMessages = conversationMessages.map((msg) =>
                    unreadIds.includes(msg._id)
                        ? { ...msg, messageStatus: "read" }
                        : msg
                )

                return {
                    messages: {
                        ...state.messages,
                        [conversationId]: updatedMessages
                    }
                }
            })

            const firstMessage = conversationMessages.find(msg => unreadIds.includes(msg._id))
            if (firstMessage?.sender?._id) {
                emitMessageRead(unreadIds, firstMessage.sender._id, conversationId)
            }
        } catch (error) {
            console.error("Failed to mark message as read:", error)
        }
    },

    // 🎯 RESET UNREAD COUNT
    resetUnreadCount: (conversationId) => {
        set(state => {
            if (!state.conversations?.data) return state

            const updatedConversations = state.conversations.data.map(conv => {
                if (conv._id === conversationId) {
                    return {
                        ...conv,
                        userUnreadCount: 0,
                        unreadCounts: {
                            ...conv.unreadCounts,
                            [get().currentUser?._id]: 0
                        }
                    }
                }
                return conv
            })

            const newUnreadCounts = new Map(state.unreadCounts)
            newUnreadCounts.set(conversationId, 0)

            return {
                conversations: {
                    ...state.conversations,
                    data: updatedConversations
                },
                unreadCounts: newUnreadCounts
            }
        })
    },

    // 🎯 ADD REACTION
    addReaction: async (messageId, emoji) => {
        try {
            const { currentUser, messages } = get();

            if (!currentUser || !messageId) return;

            let targetConvId = null
            let targetMessage = null

            for (const [convId, convMessages] of Object.entries(messages)) {
                const msg = convMessages.find(m => m._id === messageId)
                if (msg) {
                    targetConvId = convId
                    targetMessage = msg
                    break
                }
            }

            if (!targetMessage) return;

            const existingReactions = Array.isArray(targetMessage.reactions) ? targetMessage.reactions : [];

            const existingReactionIndex = existingReactions.findIndex(
                r => {
                    const reactionUserId = r.user?._id || r.user;
                    return String(reactionUserId) === String(currentUser._id) && r.emoji === emoji;
                }
            );

            let updatedReactions;
            let action = 'add';

            if (existingReactionIndex >= 0) {
                updatedReactions = existingReactions.filter((_, index) => index !== existingReactionIndex);
                action = 'remove';
            } else {
                updatedReactions = existingReactions.filter(
                    r => {
                        const reactionUserId = r.user?._id || r.user;
                        return String(reactionUserId) !== String(currentUser._id);
                    }
                );

                updatedReactions.push({
                    _id: `temp-${Date.now()}`,
                    emoji: emoji,
                    user: currentUser._id,
                    userName: currentUser.username || currentUser.name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            set((state) => ({
                messages: {
                    ...state.messages,
                    [targetConvId]: state.messages[targetConvId]?.map((msg) => {
                        if (msg._id !== messageId) return msg;
                        return {
                            ...msg,
                            reactions: updatedReactions
                        };
                    }) || []
                }
            }));

            const socketSuccess = emitReaction({
                messageId,
                emoji,
                userId: currentUser._id,
                action: action
            });

            if (!socketSuccess) {
                setTimeout(() => {
                    const { messages: currentMessages } = get();
                    const currentMessage = currentMessages[targetConvId]?.find(msg => msg._id === messageId);

                    if (currentMessage && currentMessage.reactions.some(r => r._id?.startsWith('temp-'))) {
                        set((state) => ({
                            messages: {
                                ...state.messages,
                                [targetConvId]: state.messages[targetConvId]?.map((msg) => {
                                    if (msg._id !== messageId) return msg;
                                    return {
                                        ...msg,
                                        reactions: existingReactions
                                    };
                                }) || []
                            }
                        }));
                        set({ error: "Failed to save reaction." });
                    }
                }, 2000);
            }

        } catch (error) {
            console.error("Error in addReaction:", error);
        }
    },

    // 🎯 DELETE MESSAGE - WhatsApp Logic (FIXED VERSION)
    deleteMessage: async (messageId, deleteForEveryone = null) => {
        try {
            const { currentUser, messages, conversations } = get()

            // Find message
            let conversationId = null
            let isSender = false
            let isReceiver = false
            let targetMessage = null

            for (const [convId, convMessages] of Object.entries(messages)) {
                const msg = convMessages.find(m => m._id === messageId)
                if (msg) {
                    conversationId = convId
                    targetMessage = msg
                    isSender = msg.sender?._id === currentUser?._id
                    isReceiver = msg.receiver?._id === currentUser?._id
                    break
                }
            }

            if (!conversationId) {
                throw new Error("Message not found")
            }

            // Determine delete type
            let finalDeleteType = deleteForEveryone
            if (finalDeleteType === null) {
                finalDeleteType = isSender // Sender: delete for everyone, Receiver: delete for me
            }

            console.log("🗑️ DELETE REQUEST:", {
                messageId,
                isSender,
                isReceiver,
                finalDeleteType,
                conversationId
            })

            // 🔴 ULTIMATE FIX: PROPER CHATLIST UPDATE FOR "DELETE FOR ME"
            set(state => {
                const updatedMessages = { ...state.messages }

                // 1. Remove from messages
                if (updatedMessages[conversationId]) {
                    updatedMessages[conversationId] = updatedMessages[conversationId].filter(
                        msg => msg._id !== messageId
                    )
                }

                // 2. 🔴 CRITICAL: FOR "DELETE FOR ME", UPDATE CHATLIST PROPERLY
                if (!finalDeleteType && isReceiver) {
                    if (!state.conversations?.data) return { messages: updatedMessages }

                    const updatedConversations = [...state.conversations.data]
                    const convIndex = updatedConversations.findIndex(c => c._id === conversationId)

                    if (convIndex >= 0) {
                        // Get remaining messages after deletion
                        const remainingMsgs = updatedMessages[conversationId] || []

                        // Find the actual last message (not deleted for this user)
                        let actualLastMessage = null

                        if (remainingMsgs.length > 0) {
                            // Sort by time and get most recent
                            const sorted = [...remainingMsgs].sort((a, b) =>
                                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                            )

                            // Find first message that's not deleted for this user
                            for (const msg of sorted) {
                                if (!msg.deletedFor || !msg.deletedFor.includes(currentUser?._id)) {
                                    actualLastMessage = msg
                                    break
                                }
                            }
                        }

                        // Update conversation in list
                        updatedConversations[convIndex] = {
                            ...updatedConversations[convIndex],
                            lastMessage: actualLastMessage || updatedConversations[convIndex].lastMessage,
                            updatedAt: new Date().toISOString(),
                            // Also update unread count if needed
                            unreadCounts: {
                                ...updatedConversations[convIndex].unreadCounts,
                                [currentUser?._id]: 0
                            }
                        }

                        // Sort by updated time (WhatsApp style)
                        updatedConversations.sort((a, b) =>
                            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                        )

                        // Update unread counts in store too
                        const newUnreadCounts = new Map(state.unreadCounts)
                        newUnreadCounts.set(conversationId, 0)

                        return {
                            messages: updatedMessages,
                            conversations: {
                                ...state.conversations,
                                data: updatedConversations
                            },
                            unreadCounts: newUnreadCounts
                        }
                    }
                }

                return {
                    messages: updatedMessages
                }
            })

            // 🔴 CALL BACKEND
            await axiosInstance.delete(`/chat/messages/${messageId}`, {
                data: { deleteForEveryone: finalDeleteType }
            })

            console.log("✅ Backend delete completed")

            // 🔴 FORCE REFRESH CONVERSATIONS FOR CONSISTENCY
            setTimeout(() => {
                get().fetchConversations()
            }, 100)

            return true

        } catch (error) {
            console.error("❌ Delete error:", error)
            // Revert by refetching
            get().fetchConversations()
            return false
        }
    },

    // 🎯 START TYPING
    startTyping: (conversationId, receiverId) => {
        const socket = getSocket()
        if (socket && conversationId && receiverId) {
            socket.emit("typing_start", {
                conversationId,
                receiverId,
                userId: get().currentUser?._id
            })
        }
    },

    // 🎯 STOP TYPING
    stopTyping: (conversationId, receiverId) => {
        const socket = getSocket()
        if (socket && conversationId && receiverId) {
            socket.emit("typing_stop", {
                conversationId,
                receiverId,
                userId: get().currentUser?._id
            })
        }
    },

    // 🎯 IS USER TYPING
    isUserTyping: (conversationId, userId) => {
        const { typingUsers } = get()
        if (!conversationId || !typingUsers.has(conversationId) || !userId) {
            return false
        }
        return typingUsers.get(conversationId).has(userId)
    },

    // 🎯 GET CHAT LIST TYPING
    getChatListTyping: (conversationId) => {
        const typingInfo = get().chatListTyping.get(conversationId)
        if (!typingInfo) return null

        const threeHundredMsAgo = Date.now() - 300
        return typingInfo.timestamp > threeHundredMsAgo ? typingInfo.userId : null
    },

    // 🎯 IS USER ONLINE - REAL-TIME CHECK
    isUserOnline: (userId) => {
        if (!userId) return null
        const { onlineUsers } = get()
        const userStatus = onlineUsers.get(userId)
        if (!userStatus) return false

        // 🔴 INSTANT ONLINE STATUS - No delay
        return userStatus.isOnline === true
    },

    // 🎯 GET USER LAST SEEN
    getUserLastSeen: (userId) => {
        if (!userId) return null
        const { onlineUsers } = get()
        const userStatus = onlineUsers.get(userId)
        return userStatus?.lastSeen || null
    },

    // 🎯 GET UNREAD COUNT
    getUnreadCount: (conversationId) => {
        return get().unreadCounts.get(conversationId) || 0
    },

    // 🎯 CHECK IF IN CHAT WINDOW
    isInChatWindow: (conversationId) => {
        return get().activeChatWindows.has(conversationId)
    },

    // 🎯 UPDATE USER STATUS
    updateUserStatus: (userId, status) => {
        set(state => {
            const newOnlineUsers = new Map(state.onlineUsers)
            newOnlineUsers.set(userId, {
                ...status,
                timestamp: Date.now()
            })

            return {
                onlineUsers: newOnlineUsers
            }
        })
    },

    // 🎯 GET USER STATUS FROM SERVER - REAL-TIME
    fetchUserStatus: async (userId) => {
        return new Promise((resolve) => {
            getImmediateStatus(userId, (status) => {
                if (status) {
                    get().updateUserStatus(userId, status)
                }
                resolve(status)
            })
        })
    },

    // 🎯
    clearChat: async (conversationId) => {
        try {
            await axiosInstance.delete(`/chat/conversations/${conversationId}/clear`)
            // Remove all messages from this conversation in the store
            set(state => ({
                messages: {
                    ...state.messages,
                    [conversationId]: []
                }
            }))
            // Update conversation's lastMessage to null and updatedAt to now
            get().updateConversationInList({
                _id: conversationId,
                lastMessage: null,
                updatedAt: new Date().toISOString()
            })
            return true
        } catch (error) {
            console.error("Clear chat failed:", error)
            return false
        }
    },

    // 🎯 CLEAN UP
    cleanUp: () => {
        const socket = getSocket()
        if (socket) {
            socket.off("receive_message")
            socket.off("user_typing")
            socket.off("user_status")
            socket.off("message_status_update")
            socket.off("message_error")
            socket.off("message_deleted")
            socket.off("conversation_updated")
            socket.off("chat_list_update")
            socket.off("reactions_update")
            socket.off("messages_read")
            socket.off("user_reading_messages")
            socket.off("contact_online")
            socket.off("user_online")
            socket.off("global_user_status")
            socket.off("USER_UPDATE_BROADCAST")
        }

        set({
            conversations: null,
            currentConversation: null,
            messages: {},
            currentUser: null,
            onlineUsers: new Map(),
            typingUsers: new Map(),
            chatListTyping: new Map(),
            pendingMessages: new Map(),
            unreadCounts: new Map(),
            activeChatWindows: new Set(),
            contacts: [],
            socketInitialized: false,
            socketListenersSet: false
        })
    }
}))