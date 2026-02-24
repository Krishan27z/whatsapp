import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import useLayoutStore from '../../stores/useLayoutStore'
import useThemeStore from '../../stores/useThemeStore'
import useUserStore from '../../stores/useUserStore'
import { useChatStore } from '../../stores/useChatStore'
import { FaPlus, FaSearch } from 'react-icons/fa'
import { motion, AnimatePresence } from 'framer-motion'
import formatTimestamp from '../../utils/formatTime'
import { getSocket } from "../../services/chat.service"

function ChatList({ contacts: initialContacts }) {
    const setSelectedContact = useLayoutStore((state) => state.setSelectedContact)
    const selectedContact = useLayoutStore((state) => state.selectedContact)
    const { theme } = useThemeStore()
    const { user } = useUserStore()
    const { conversations, fetchConversations, isUserOnline, getUserLastSeen, getChatListTyping,
        getUnreadCount, fetchUserStatus, contacts: storeContacts  } = useChatStore()
    const socket = getSocket()

    const [searchTerms, setSearchTerms] = useState("")
    const [previewImage, setPreviewImage] = useState(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [typingStatus, setTypingStatus] = useState(new Map())
    const [userStatusCache, setUserStatusCache] = useState(new Map())
    const [initialLoad, setInitialLoad] = useState(true)


    // 🔴 Compute merged contacts (initial + store, deduplicated)
    const mergedContacts = useMemo(() => {
        const base = initialContacts || [];
        const stored = storeContacts || [];
        const combined = [...base, ...stored];
        // Deduplicate by _id
        return Array.from(new Map(combined.map(u => [u._id, u])).values());
    }, [initialContacts, storeContacts])


    // 🔴 REAL-TIME SOCKET LISTENERS - FIXED VERSION
    useEffect(() => {
        const updateTypingStatus = () => {
            const newTypingStatus = new Map()

            if (conversations?.data) {
                conversations.data.forEach(conv => {
                    const typingUserId = getChatListTyping(conv._id)
                    if (typingUserId) {
                        const otherParticipant = conv.participants?.find(p => p._id !== user?._id)
                        if (otherParticipant && otherParticipant._id === typingUserId) {
                            newTypingStatus.set(conv._id, true)
                        }
                    }
                })
            }

            setTypingStatus(newTypingStatus)
        }

        updateTypingStatus()
        const interval = setInterval(updateTypingStatus, 1000)

        return () => clearInterval(interval)
    }, [conversations, user, getChatListTyping])

    // 🔴 REAL-TIME TYPING STATUS UPDATE
    useEffect(() => {
        const updateTypingStatus = () => {
            const newTypingStatus = new Map()

            if (conversations?.data) {
                conversations.data.forEach(conv => {
                    const typingUserId = getChatListTyping(conv._id)
                    if (typingUserId) {
                        const otherParticipant = conv.participants?.find(p => p._id !== user?._id)
                        if (otherParticipant && otherParticipant._id === typingUserId) {
                            newTypingStatus.set(conv._id, true)
                        }
                    }
                })
            }

            setTypingStatus(newTypingStatus)
        }

        updateTypingStatus()
        const interval = setInterval(updateTypingStatus, 300)

        return () => clearInterval(interval)
    }, [conversations, user, getChatListTyping])

    // 🔴 REAL-TIME USER STATUS UPDATE
    useEffect(() => {
        const updateAllUserStatuses = async () => {
            const contactsToProcess = [...(mergedContacts  || []), ...(conversations?.data?.flatMap(conv =>
                conv.participants?.filter(p => p._id !== user?._id) || []
            ) || [])]

            const uniqueContacts = Array.from(new Map(
                contactsToProcess.map(contact => [contact._id, contact])
            ).values())

            for (const contact of uniqueContacts) {
                if (contact._id) {
                    try {
                        const isOnlineInStore = isUserOnline(contact._id)

                        if (!userStatusCache.get(contact._id)?.isOnline && isOnlineInStore) {
                            setUserStatusCache(prev => new Map(prev).set(contact._id, {
                                isOnline: true,
                                lastSeen: new Date(),
                                timestamp: Date.now()
                            }))
                        }

                        const status = await fetchUserStatus(contact._id)
                        if (status) {
                            setUserStatusCache(prev => new Map(prev).set(contact._id, {
                                isOnline: status.isOnline,
                                lastSeen: status.lastSeen,
                                timestamp: Date.now()
                            }))
                        }
                    } catch (error) {
                        console.error(`Failed to fetch status for ${contact._id}:`, error)
                    }
                }
            }
        }

        updateAllUserStatuses()
        const interval = setInterval(updateAllUserStatuses, 10000)

        return () => clearInterval(interval)
    }, [mergedContacts , conversations, user, fetchUserStatus, isUserOnline])





    // 🔴 Get user status with INSTANT update
    const getUserStatus = useCallback((userId) => {
        // Check cache first
        const cachedStatus = userStatusCache.get(userId)

        // 🔴 REAL-TIME CHECK FROM STORE (No delay)
        const storeStatus = {
            isOnline: isUserOnline(userId),
            lastSeen: getUserLastSeen(userId)
        }

        // If store says online, use that IMMEDIATELY
        if (storeStatus.isOnline) {
            return {
                isOnline: true,
                lastSeen: storeStatus.lastSeen || new Date(),
                immediate: true
            }
        }

        // Otherwise use cached status
        if (cachedStatus) {
            return cachedStatus
        }

        return storeStatus
    }, [userStatusCache, isUserOnline, getUserLastSeen])

    // 🔴 Handle fetch conversations
    const handleFetchConversations = useCallback(async () => {
        if (isRefreshing) return

        setIsRefreshing(true)
        try {
            await fetchConversations()
        } finally {
            setIsRefreshing(false)
            setInitialLoad(false)
        }
    }, [fetchConversations, isRefreshing])

    // 🔴 Initial fetch
    useEffect(() => {
        handleFetchConversations()
    }, [])

    // 🔴 WHATSAPP-STYLE CHAT LIST SORTING
    const getMergedChatList = useCallback(() => {
        const mergedList = []
        const conversationData = conversations?.data || []

        // 1️⃣ PROCESS CONVERSATIONS
        if (conversationData.length > 0) {
            conversationData.forEach((conv, index) => {
                const otherParticipant = conv.participants?.find(
                    (participant) => participant._id !== user?._id
                )

                if (otherParticipant) {
                    const status = getUserStatus(otherParticipant._id)
                    const isTyping = typingStatus.get(conv._id) || false
                    const unreadCount = getUnreadCount(conv._id) || conv.userUnreadCount || 0

                    // 🔴 WHATSAPP LOGIC: Last Message time is the ONLY source of truth for sorting.
                    // We avoid 'updatedAt' because it changes when a user reads a message.
                    const lastMessageTime = conv.lastMessage?.createdAt
                        ? new Date(conv.lastMessage.createdAt).getTime()
                        : 0;

                    // If no message exists (all deleted), we fallback to conversation creation time
                    const fallbackTime = new Date(conv.createdAt || 0).getTime();

                    // If message exists, its time is absolute. If not, its creation time.
                    const sortTimestamp = lastMessageTime > 0 ? lastMessageTime : fallbackTime

                    mergedList.push({
                        type: 'conversation',
                        data: conv,
                        contact: otherParticipant,
                        lastMessage: conv.lastMessage,
                        unreadCount: unreadCount,
                        // keep updatedAt for metadata, but NOT for sorting
                        updatedAt: conv.updatedAt,
                        timestamp: sortTimestamp,
                        originalIndex: index,
                        isTemp: conv._id?.startsWith('temp-conv-'),
                        isOnline: status.isOnline,
                        lastSeen: status.lastSeen,
                        isTyping: isTyping,
                        immediate: status.immediate,
                        conversationId: conv._id,
                        hasUnread: unreadCount > 0,
                        lastMessageTime: lastMessageTime
                    })
                }
            })
        }

        // 2️⃣ PROCESS CONTACTS (Non-chatters)
        if (mergedContacts  && Array.isArray(mergedContacts )) {
            mergedContacts .forEach(contact => {
                const exists = mergedList.some(item =>
                    item.contact?._id === contact._id
                )

                if (!exists) {
                    const status = getUserStatus(contact._id)
                    mergedList.push({
                        type: 'contact',
                        data: null,
                        contact: contact,
                        lastMessage: null,
                        unreadCount: 0,
                        updatedAt: null,
                        timestamp: 0, // Contacts with no chats stay at bottom
                        isTemp: false,
                        isOnline: status.isOnline,
                        lastSeen: status.lastSeen,
                        isTyping: false,
                        immediate: status.immediate,
                        conversationId: null,
                        hasUnread: false,
                        lastMessageTime: 0
                    })
                }
            })
        }

        // 3️⃣ FINAL STABLE SORT
        return mergedList.sort((a, b) => {
            if (b.timestamp !== a.timestamp) {
                return b.timestamp - a.timestamp;
            }
            // Jodi duto-i contact hoy (timestamp 0), tahole A-Z sort koro
            return a.contact?.username?.localeCompare(b.contact?.username);
        })

    }, [conversations, mergedContacts, user, getUserStatus, typingStatus, getUnreadCount]);

    const mergedChatList = useMemo(() => getMergedChatList(), [getMergedChatList])

    // 🔴 Filter by search
    const filteredChatList = useMemo(() => {
        return mergedChatList.filter((item) =>
            item.contact?.username?.toLowerCase().includes(searchTerms.toLowerCase())
        )
    }, [mergedChatList, searchTerms])



    // 🔴 IMMEDIATE STATUS FOR ALL CONTACTS
    useEffect(() => {
        const checkAllContactsStatus = () => {
            const socket = getSocket();
            if (!socket || !socket.connected) return;

            // Check all contacts in the list
            filteredChatList.forEach(item => {
                if (item.contact?._id) {
                    socket.emit("get_immediate_status", {
                        userId: item.contact._id
                    }, (response) => {
                        if (response?.isOnline) {
                            useChatStore.getState().updateUserStatus(item.contact._id, {
                                isOnline: true,
                                lastSeen: new Date(),
                                immediate: true
                            });
                        }
                    });
                }
            });
        };

        // Check every 10 seconds
        const interval = setInterval(checkAllContactsStatus, 10000);
        return () => clearInterval(interval);
    }, [filteredChatList]);


    // 🔴 Handle contact click
    const handleContactClick = useCallback((item) => {
        if (item.type === 'conversation') {
            setSelectedContact({
                ...item.contact,
                conversationId: item.data._id,
                isTemp: item.data._id?.startsWith('temp-conv-')
            })

            if (item.data._id) {
                // 1. IMMEDIATE LOCAL STORE UPDATE
                useChatStore.setState(state => {
                    const newUnreadCounts = new Map(state.unreadCounts)
                    newUnreadCounts.set(item.data._id, 0)

                    let updatedConversations = state.conversations?.data || []
                    updatedConversations = updatedConversations.map(conv => {
                        if (conv._id === item.data._id) {
                            return {
                                ...conv,
                                userUnreadCount: 0,
                                unreadCounts: {
                                    ...conv.unreadCounts,
                                    [user?._id]: 0
                                }
                            }
                        }
                        return conv
                    })

                    return {
                        unreadCounts: newUnreadCounts,
                        conversations: state.conversations ? {
                            ...state.conversations,
                            data: updatedConversations
                        } : state.conversations
                    }
                })

                // 2. EMIT TO BACKEND
                if (socket && user?._id) {
                    setTimeout(() => {
                        socket.emit("user_in_chat_window", {
                            conversationId: item.data._id,
                            userId: user._id,
                            isInWindow: true
                        })

                        socket.emit("enter_chat_window", {
                            conversationId: item.data._id,
                            userId: user._id,
                            immediate: true
                        })
                    }, 0)
                }
            }
        } else {
            setSelectedContact({
                ...item.contact,
                conversationId: null,
                isTemp: false
            })
        }

        setSearchTerms("")
    }, [setSelectedContact, user])

    // 🔴 Get last message preview
    const getLastMessagePreview = useCallback((item) => {
        if (item.isTyping) {
            return (
                <span className="text-green-500 italic font-semibold">
                    typing...
                </span>
            )
        }

        if (!item.lastMessage) return ''

        const isDeletedForMe = item.lastMessage.deletedFor &&
            Array.isArray(item.lastMessage.deletedFor) &&
            item.lastMessage.deletedFor.includes(user?._id)

        if (isDeletedForMe) {
            if (item.data?._id) {
                const conversationId = item.data._id

                const { messages } = useChatStore.getState()
                const conversationMessages = messages[conversationId] || []

                const validMessages = conversationMessages.filter(msg => {
                    if (!msg.deletedFor || !Array.isArray(msg.deletedFor)) return true
                    return !msg.deletedFor.includes(user?._id)
                })

                validMessages.sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )

                const recentMessage = validMessages[0]

                if (recentMessage) {
                    switch (recentMessage.contentType) {
                        case 'text':
                            return recentMessage.content || ''
                        case 'image':
                            return '📷 Image'
                        case 'video':
                            return '🎬 Video'
                        case 'audio':
                            return '🔊 Audio'
                        case 'document':
                            return '📎 Document'
                        default:
                            return '📄 File'
                    }
                }
            }

            return 'No messages'
        }

        switch (item.lastMessage.contentType) {
            case 'text':
                return item.lastMessage.content || ''
            case 'image':
                return '📷 Image'
            case 'video':
                return '🎬 Video'
            case 'audio':
                return '🔊 Audio'
            case 'document':
                return '📎 Document'
            default:
                return '📄 File'
        }
    }, [user])




    return (
        <div
            className={`w-full md:w-[360px] h-screen flex flex-col relative border-r
                ${theme === 'dark' ? "border-gray-600 bg-[rgb(17,27,33)]" : "border-gray-200 bg-white"}`}
        >
            {/* Header + Search */}
            <div
                className={`fixed top-0 w-full md:w-[360px] z-50 border-r
                    ${theme === 'dark'
                        ? "border-gray-600 bg-[rgb(17,27,33)]"
                        : "border-gray-200 bg-white"
                    }`}
            >
                {/* Header */}
                <div className={`p-4 flex justify-between items-center ${theme === 'dark' ? "text-white" : "text-gray-800"}`}>
                    <h2 className='text-xl font-semibold'>Chats</h2>
                    <button
                        className={`p-2 rounded-full transition-colors ml-2 text-white cursor-pointer
                            ${isRefreshing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'}`}
                        onClick={() => {
                            handleFetchConversations()
                        }}
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? (
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <FaPlus />
                        )}
                    </button>
                </div>

                {/* Search */}
                <div className='px-1 pb-4'>
                    <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border focus-within:ring-2 focus-within:ring-green-500
                            ${theme === 'dark'
                                ? "bg-gray-800 border-gray-700 text-gray-300"
                                : "bg-gray-100 border-gray-100 text-black"
                            }`}
                    >
                        <FaSearch className={`${theme === 'dark' ? "text-gray-300" : "text-gray-700"} shrink-0`} />
                        <input
                            type='text'
                            placeholder='Search or Start New Chat'
                            value={searchTerms}
                            onChange={(e) => setSearchTerms(e.target.value)}
                            className={`w-full bg-transparent outline-none border-none text-base
                ${theme === 'dark' ? "placeholder-gray-300" : "placeholder-gray-600"}`}
                        />
                    </div>
                </div>
            </div>

            {/* Scrollable Chat List */}
            <div className='flex-1 overflow-y-auto pt-[132px] px-1'>
                {isRefreshing && (
                    <motion.div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-gray-900/80 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="relative">
                                <div className="animate-spin rounded-full h-10 w-10 border-3 border-green-200 border-t-green-500"></div>
                            </div>
                            <p className="text-green-600 font-medium text-sm">Refreshing...</p>
                        </div>
                    </motion.div>
                )}

                <AnimatePresence>
                    {initialLoad && filteredChatList.length === 0 ? (
                        //& Showing Loading Until all data come from Backend for that specific chatWindow
                        <div className="flex flex-col items-center justify-center h-64 space-y-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                            <p className="text-gray-500">Loading chats...</p>
                        </div>
                    ) : filteredChatList.length > 0 ? (
                        filteredChatList.map((item, index) => {
                            const isSelected = selectedContact?._id === item.contact?._id
                            const isOnline = item.isOnline
                            const isTyping = item.isTyping

                            return (
                                <motion.div
                                    key={`${item.type}-${item.conversationId || item.contact?._id}`}
                                    onClick={() => handleContactClick(item)}
                                    className={`px-2 py-3 flex items-center cursor-pointer rounded-lg mb-0.5
                                            ${theme === 'dark'
                                            ? isSelected ? "bg-gray-700" : "hover:bg-gray-800"
                                            : isSelected ? "bg-green-50 hover:bg-green-100" : "hover:bg-gray-200"
                                        }`}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3, delay: index * 0.03 }}
                                >
                                    {/* Profile Picture */}
                                    <div className="relative w-11 h-11 flex-shrink-0 rounded-full overflow-hidden bg-green-100"
                                        onClick={(e) => { e.stopPropagation(); setPreviewImage(item.contact?.profilePicture) }}>
                                        <img
                                            src={item.contact?.profilePicture}
                                            alt={item.contact?.username}
                                            className="min-w-full min-h-full object-cover object-center"
                                            onError={(e) => {
                                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.contact?.username || 'User')}&background=random&color=fff`
                                            }}
                                            loading="lazy"
                                        />
                                        {/*//^ Show 'Green Dot' when user is Online  */}
                                        {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>}
                                    </div>

                                    {/* Chat Info */}
                                    <div className='ml-3 min-w-0 flex-1'>
                                        <div className='flex justify-between items-center mb-1'>
                                            <h2 className={`font-semibold truncate ${theme === 'dark' ? "text-white" : "text-black"}`}>
                                                {item.contact?.username}
                                            </h2>
                                            {item.lastMessage && !isTyping && (
                                                <span className={`text-xs flex-shrink-0 ml-2 ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}>
                                                    {formatTimestamp(item.lastMessage?.createdAt)}
                                                </span>
                                            )}
                                        </div>
                                        <div className='flex justify-between items-center'>
                                            {/* Last Message */}
                                            <p className={`text-sm truncate min-w-0 flex-1 mr-2 
                                              ${isTyping ? 'text-green-500 italic' : theme === 'dark' ? "text-gray-400" : "text-gray-600"}`}>
                                                {getLastMessagePreview(item)}
                                            </p>
                                            {/* Unread Count Badge */}
                                            {item.unreadCount > 0 && (
                                                <div className="flex items-center space-x-2">
                                                    {item.lastMessage?.messageStatus === 'read' && <span className="text-xs text-gray-400">Seen</span>}
                                                    <span className={`text-xs font-semibold min-w-[20px] h-5 flex items-center justify-center bg-green-500
                                                        ${theme === 'dark' ? "text-gray-800" : "text-gray-50"} rounded-full px-1`}>
                                                        {item.unreadCount > 9 ? '9+' : item.unreadCount}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })
                    ) : (
                        <div className="flex items-center justify-center h-64">
                            <p className={`text-gray-500 ${theme === 'dark' ? "text-gray-400" : "text-gray-600"}`}>
                                {searchTerms ? "No conversations found" : "No conversations yet"}
                            </p>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Profile Preview Modal */}
            {previewImage && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
                    onClick={() => setPreviewImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 text-white text-2xl sm:text-3xl font-bold hover:bg-white/20 p-2 rounded-full transition-colors"
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(null) }}
                    >
                        ✕
                    </button>
                    <motion.img
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", damping: 15 }}
                        src={previewImage}
                        alt="Profile Preview"
                        className="max-w-[90%] max-h-[80%] rounded-lg object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </motion.div>
            )}
        </div>
    )
}

export default ChatList