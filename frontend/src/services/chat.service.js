import { io } from 'socket.io-client'
import useUserStore from '../stores/useUserStore'
import {useChatStore} from '../stores/useChatStore'

let socket = null
let isConnecting = false
let connectionAttempts = 0
const MAX_RECONNECTION_ATTEMPTS = 10
let heartbeatInterval = null
let reconnectTimer = null
let browserId = null
let connectionPromise = null


//& 🔴 BROWSER ID
const getBrowserId = () => {
  if (!browserId) {
    browserId = localStorage.getItem('browserId') || `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem('browserId', browserId)
  }
  return browserId
}

//& 🔴 HEARTBEAT FUNCTION
const startHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
  }

  heartbeatInterval = setInterval(() => {
    if (socket?.connected) {
      const userId = useUserStore.getState().user?._id
      socket.emit("heartbeat", {
        timestamp: Date.now(),
        userId: userId,
        browserId: browserId
      })

      // 🔴 UPDATE LOCAL STORE FOR SELF
      const chatStore = useChatStore.getState()
      if (chatStore.updateUserStatus) {
        chatStore.updateUserStatus(userId, {
          isOnline: true,
          lastSeen: new Date()
        })
      }
    }
  }, 2000)
}

//& 🔴 SOCKET INITIALIZATION - returns a promise that resolves when connected
export const initializeSocket = () => {
  // Return existing promise if already connecting
  if (connectionPromise) {
    return connectionPromise
  }

  connectionPromise = new Promise((resolve, reject) => {
    try {
      console.log("🔌 initializeSocket function called")

      const token = localStorage.getItem("auth_token") //^ We store the JWT token in localStorage after login/signup, 
                                    //^ and use it to authenticate the socket connection. 
                                    //^ The backend socketMiddleware will verify this token to authenticate the user for real-time features.

      //& Cleanup old socket
      if (socket) {
        if (socket.connected) {
          socket.disconnect()
        }
        socket = null
      }

      //& Cleanup intervals
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }

      const user = useUserStore.getState()
      let userId = user?._id || user?.id || user?.user?._id

      if (!userId) {
        const userData = localStorage.getItem('user');
        if (userData) {
          try {
            const parsedUser = JSON.parse(userData);
            userId = parsedUser._id || parsedUser.id;
          } catch (error) {
            console.error("Error parsing user data:", error)
          }
        }
      }

      if (!userId) {
        console.error("Cannot initialize socket: No user ID found")
        connectionPromise = null
        reject("No user ID")
        return
      }

      console.log("✅ Socket initialization with user ID:", userId)

      const BACKEND_URL = import.meta.env.VITE_API_URL
      browserId = getBrowserId()

      // 🔴 CRITICAL: Create socket instance
      const newSocket = io(BACKEND_URL, {
        auth: {token: token},
        // withCredentials: true,
        transports: ["websocket", "polling"],
        reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnection: true,
        autoConnect: true,
        forceNew: true,
        query: {
          userId: userId,
          browserId: browserId
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        closeOnBeforeunload: false,
        timeout: 20000,
        randomizationFactor: 0.5,
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000,
          skipMiddlewares: true
        }
      })

      // Assign to global socket variable
      socket = newSocket

      //! ------- [1] CONNECTION EVENTS --------
      newSocket.on("connect", () => {
        try {
          console.log("✅✅✅ Socket CONNECTED. ID:", newSocket.id)
          isConnecting = false
          connectionAttempts = 0

          // Mark user as online in store
          if (useUserStore.getState().setSocketConnected) {
            useUserStore.getState().setSocketConnected(true)
          }

          // 🔴 CRITICAL: Send user_connected IMMEDIATELY
          console.log("📡 Emitting user_connected for:", userId)
          newSocket.emit("user_connected", {
            userId: userId,
            browserId: browserId,
            timestamp: Date.now(),
            immediate: true
          })

          // 🔴 START HEARTBEAT
          startHeartbeat()

          // Clear reconnect timer
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }

          // 🔴 UPDATE OWN STATUS IN STORE
          setTimeout(() => {
            const chatStore = useChatStore.getState()
            if (chatStore.updateUserStatus) {
              chatStore.updateUserStatus(userId, {
                isOnline: true,
                lastSeen: new Date()
              })
            }
          }, 100)

          // Resolve the promise
          resolve(newSocket)
        } catch (error) {
          console.error("❌ Error in socket connect:", error)
          reject(error)
        }
      })

      //! ------- [1.1] CONNECTION ERROR --------
      newSocket.on("connect_error", (error) => {
        console.log("❌ Socket Connection Error:", error.message)
        isConnecting = false
        connectionAttempts++

        if (useUserStore.getState().setSocketConnected) {
          useUserStore.getState().setSocketConnected(false)
        }

        // 🔴 AGGRESSIVE RECONNECTION
        if (connectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
          console.log(`🔄 Reconnecting attempt ${connectionAttempts}/${MAX_RECONNECTION_ATTEMPTS}`)
          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect()
            }
          }, 1000 * connectionAttempts)
        } else {
          console.error("Max reconnection attempts reached")
          reconnectTimer = setTimeout(() => {
            console.log("🔄 Attempting final reconnect...")
            connectionAttempts = 0
            connectionPromise = null
            initializeSocket()
          }, 1000)
        }

        reject(error)
      })

      //! ------- [1.2] RECONNECTION EVENTS --------
      newSocket.on("reconnect", (attemptNumber) => {
        console.log("🔄 Socket Reconnected after", attemptNumber, "attempts")

        // 🔴 RE-EMIT USER CONNECTED
        const currentUserId = useUserStore.getState().user?._id || userId
        setTimeout(() => {
          console.log("📡 Re-emitting user_connected after reconnect:", currentUserId)
          newSocket.emit("user_connected", {
            userId: currentUserId,
            browserId: browserId,
            timestamp: Date.now(),
            reconnected: true
          })
        }, 100)

        if (useUserStore.getState().setSocketConnected) {
          useUserStore.getState().setSocketConnected(true)
        }

        // 🔴 RESTART HEARTBEAT
        startHeartbeat()
      })

      newSocket.on("reconnect_attempt", (attemptNumber) => {
        console.log("🔄 Socket Reconnection Attempt:", attemptNumber)
        connectionAttempts = attemptNumber
      })

      newSocket.on("reconnect_error", (error) => {
        console.log("❌ Socket Reconnection Error:", error.message)
      })

      newSocket.on("reconnect_failed", () => {
        console.log("❌ Socket Reconnection Failed")
        if (useUserStore.getState().setSocketConnected) {
          useUserStore.getState().setSocketConnected(false)
        }

        reconnectTimer = setTimeout(() => {
          console.log("🔄 Last ditch reconnect attempt...")
          connectionAttempts = 0
          connectionPromise = null
          initializeSocket()
        }, 1000)
      })

      //! ------- [2] DISCONNECTION --------
      newSocket.on("disconnect", (reason) => {
        console.log("🔌 Socket Disconnected. Reason:", reason)
        isConnecting = false

        if (heartbeatInterval) {
          clearInterval(heartbeatInterval)
          heartbeatInterval = null
        }

        if (reason === 'io server disconnect' || reason === 'transport error') {
          if (useUserStore.getState().setSocketConnected) {
            useUserStore.getState().setSocketConnected(false)
          }

          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect()
            }
          }, 1000)
        }
      })

      //! ------- [3] BROWSER CLOSE EVENT ---------
      const handleBeforeUnload = () => {
        if (newSocket?.connected) {
          console.log("🌐 Browser closing, emitting browser_close...")
          newSocket.emit("browser_close")
        }
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      // Store cleanup function
      newSocket._cleanup = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }

      // 🔴 FORCE CONNECTION
      setTimeout(() => {
        if (!newSocket.connected && !isConnecting) {
          newSocket.connect()
        }
      }, 100)

    } catch (error) {
      console.error("🔥 Critical error in initializeSocket:", error)
      isConnecting = false
      connectionPromise = null
      reject(error)
    }
  })

  return connectionPromise
}

// 🔴 SYNCHRONOUS SOCKET GETTER - returns current socket (may be null)
export const getSocket = () => {
  return socket
}

// 🔴 Wait for socket to be connected (useful for stores that need to set up listeners)
export const waitForSocketConnection = async () => {
  if (socket?.connected) return socket
  // If initialization is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise
  }
  // Otherwise start initialization and wait
  return initializeSocket()
}

// 🔴 EMIT REACTION
export const emitReaction = async (reactionData) => {
  try {
    const currentSocket = socket // use synchronous getter
    if (currentSocket?.connected) {
      console.log("📤 Emitting reaction:", reactionData)
      currentSocket.emit("add_reactions", reactionData)
      return true
    } else {
      console.warn("Socket not connected, reaction queued")
      setTimeout(async () => {
        const s = await waitForSocketConnection()
        if (s?.connected) {
          s.emit("add_reactions", reactionData)
        }
      }, 1000)
      return true
    }
  } catch (error) {
    console.error(`Error emitting reaction:`, error)
    return false
  }
}

// 🔴 SOCKET STATUS
export const getSocketStatus = () => {
  try {
    if (!socket) return { connected: false, connecting: false }

    return {
      connected: socket.connected,
      connecting: isConnecting,
      id: socket.id,
      browserId: browserId,
      connectionAttempts
    }
  } catch (error) {
    console.error("Error in getSocketStatus:", error)
    return { connected: false, connecting: false }
  }
}

// 🔴 SOCKET DISCONNECT (ONLY ON LOGOUT)
export const disconnectSocket = () => {
  try {
    if (socket) {
      console.log("🚪 User logging out, disconnecting socket...")

      if (socket._cleanup) {
        socket._cleanup()
      }

      socket.emit("user_logout", {
        userId: useUserStore.getState().user?._id,
        timestamp: Date.now()
      })

      socket.disconnect()
      socket = null
      isConnecting = false
      connectionAttempts = 0
      connectionPromise = null

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }

      localStorage.removeItem('browserId')
      console.log("✅ Socket disconnected for logout")
    }
  } catch (error) {
    console.error("Error in disconnectSocket:", error)
  }
}

// 🔴 SOCKET RECONNECT
export const reconnectSocket = async () => {
  try {
    if (socket && !socket.connected) {
      console.log("Manually reconnecting socket...")
      if (!isConnecting) {
        isConnecting = true
        socket.connect()
      }
      return socket
    } else if (!socket) {
      console.log("Initializing new socket connection...")
      return await initializeSocket()
    }
    return socket
  } catch (error) {
    console.error("Error in reconnectSocket:", error)
    return null
  }
}

// 🔴 EMIT EVENTS HELPERS - now async, waits for connection if needed
export const emitSocketEvent = async (event, data) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected) {
      console.log(`📤 Emitting ${event}:`, data)
      currentSocket.emit(event, data)
      return true
    } else {
      console.warn(`Socket not connected, cannot emit ${event}`)
      return false
    }
  } catch (error) {
    console.error(`Error emitting ${event}:`, error)
    return false
  }
}

// 🔴 SPECIFIC EVENT EMITTERS - using emitSocketEvent
export const emitTypingStart = async (conversationId, receiverId) => {
  try {
    const currentUser = useUserStore.getState().user
    if (currentUser?._id && conversationId && receiverId) {
      return await emitSocketEvent("typing_start", {
        conversationId,
        receiverId,
        userId: currentUser._id
      })
    }
    return false
  } catch (error) {
    console.error("Error in emitTypingStart:", error)
    return false
  }
}

export const emitTypingStop = async (conversationId, receiverId) => {
  try {
    const currentUser = useUserStore.getState().user
    if (currentUser?._id && conversationId && receiverId) {
      return await emitSocketEvent("typing_stop", {
        conversationId,
        receiverId,
        userId: currentUser._id
      })
    }
    return false
  } catch (error) {
    console.error("Error in emitTypingStop:", error)
    return false
  }
}

export const emitMessageRead = async (messageIds, senderId, conversationId) => {
  try {
    const currentUser = useUserStore.getState().user
    if (currentUser?._id) {
      console.log("📤 Emitting message_read:", { messageIds, senderId, conversationId })
      return await emitSocketEvent("message_read", {
        messageIds,
        senderId,
        conversationId,
        readerId: currentUser._id
      })
    }
    return false
  } catch (error) {
    console.error("Error in emitMessageRead:", error)
    return false
  }
}

export const emitGetUserStatus = async (userId, callback) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected) {
      currentSocket.emit("get_user_status", userId, callback)
      return true
    }
    return false
  } catch (error) {
    console.error("Error in emitGetUserStatus:", error)
    return false
  }
}

export const joinConversationRoom = async (conversationId) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected && conversationId) {
      console.log(`👥 Joining conversation room: ${conversationId}`)
      currentSocket.emit("join_conversation", conversationId)
      return true
    }
    return false
  } catch (error) {
    console.error("Error joining conversation room:", error)
    return false
  }
}

export const leaveConversationRoom = async (conversationId) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected && conversationId) {
      console.log(`👥 Leaving conversation room: ${conversationId}`)
      currentSocket.emit("leave_conversation", conversationId)
      return true
    }
    return false
  } catch (error) {
    console.error("Error leaving conversation room:", error)
    return false
  }
}

// 🔴 CHAT WINDOW MANAGEMENT
export const emitEnterChatWindow = async (conversationId) => {
  try {
    const currentUser = useUserStore.getState().user
    const currentSocket = await waitForSocketConnection()

    if (currentSocket?.connected && conversationId && currentUser?._id) {
      console.log(`💬 Emitting enter_chat_window: ${conversationId}`)
      currentSocket.emit("enter_chat_window", {
        conversationId,
        userId: currentUser._id
      })
      return true
    }
    return false
  } catch (error) {
    console.error("Error in emitEnterChatWindow:", error)
    return false
  }
}

export const emitLeaveChatWindow = async (conversationId) => {
  try {
    const currentUser = useUserStore.getState().user
    const currentSocket = await waitForSocketConnection()

    if (currentSocket?.connected && conversationId && currentUser?._id) {
      console.log(`💬 Emitting leave_chat_window: ${conversationId}`)
      currentSocket.emit("leave_chat_window", {
        conversationId,
        userId: currentUser._id
      })
      return true
    }
    return false
  } catch (error) {
    console.error("Error in emitLeaveChatWindow:", error)
    return false
  }
}

// 🔴 MESSAGE DELETION
export const emitMessageDeleted = async (messageId, conversationId, deleteForEveryone) => {
    try {
        const currentUser = useUserStore.getState().user
        const currentSocket = await waitForSocketConnection()

        if (currentSocket?.connected) {
            console.log("⚡ INSTANT delete broadcast")
            currentSocket.emit("message_delete_broadcast", {
                messageId,
                conversationId,
                deletedForEveryone: deleteForEveryone,
                deleterId: currentUser._id
            })
            return true
        }
        return false
    } catch (error) {
        console.error("Error in emitMessageDeleted:", error)
        return false
    }
}

// 🔴 GET ONLINE USERS
export const emitGetOnlineUsers = async (callback) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected) {
      currentSocket.emit("get_online_users", callback)
      return true
    }
    return false
  } catch (error) {
    console.error("Error in emitGetOnlineUsers:", error)
    return false
  }
}

// 🔴 CHECK CHAT WINDOW
export const emitCheckChatWindow = async (conversationId, callback) => {
  try {
    const currentUser = useUserStore.getState().user
    const currentSocket = await waitForSocketConnection()

    if (currentSocket?.connected && conversationId && currentUser?._id) {
      currentSocket.emit("check_chat_window", {
        userId: currentUser._id,
        conversationId
      }, callback)
      return true
    }
    return false
  } catch (error) {
    console.error("Error in emitCheckChatWindow:", error)
    return false
  }
}

// 🔴 GET IMMEDIATE STATUS
export const getImmediateStatus = async (userId, callback) => {
  try {
    const currentSocket = await waitForSocketConnection()
    if (currentSocket?.connected) {
      console.log("📡 Getting immediate status for:", userId)
      currentSocket.emit("get_immediate_status", userId, callback)
      return true
    }
    return false
  } catch (error) {
    console.error("Error in getImmediateStatus:", error)
    return false
  }
}

// 🔴 EMIT CONVERSATION UPDATE
export const emitConversationUpdate = async (conversationId) => {
    try {
        const currentSocket = await waitForSocketConnection()
        if (currentSocket?.connected && conversationId) {
            console.log("🔄 Emitting conversation update:", conversationId)
            currentSocket.emit("update_conversation", { conversationId })
            return true
        }
        return false
    } catch (error) {
        console.error("Error emitting conversation update:", error)
        return false
    }
}

// 🔴 EMIT INSTANT UPDATE
export const emitInstantUpdate = async (targetUserId, event, data) => {
    try {
        const currentSocket = await waitForSocketConnection()
        if (currentSocket?.connected) {
            console.log(`⚡ Emitting ${event} to ${targetUserId}`)
            currentSocket.emit(event, {
                ...data,
                targetUserId
            })
            return true
        }
        return false
    } catch (error) {
        console.error(`Error emitting ${event}:`, error)
        return false
    }
}