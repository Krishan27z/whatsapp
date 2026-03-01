import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import useThemeStore from '../../stores/useThemeStore'
import useUserStore from '../../stores/useUserStore'
import { useChatStore } from '../../stores/useChatStore'
import { isToday, isYesterday, format, differenceInDays } from 'date-fns'
import whatsappImage from '../../images/whatsapp_image.png'
import { FaArrowLeft, FaFile, FaImage, FaLock, FaPaperclip, FaPaperPlane, FaSmile, FaTimes, FaVideo, FaCheckCircle, FaSpinner } from 'react-icons/fa'
import MessageBubble from "./MessageBubble"
import EmojiPicker from 'emoji-picker-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSocket, emitEnterChatWindow, emitLeaveChatWindow } from "../../services/chat.service"
import heic2any from 'heic2any'
import axiosInstance from '../../services/url.service'
import VideoCallManager from '../VideoCall/VideoCallManager'
import useVideoCallStore from '../../stores/useVideoCallStore'
import ChatOptionsMenu from '../ChatOptions/ChatOptionsMenu'
import { useWallpaper } from '../ChatOptions/useWallpaper'
import { logOutUser } from '../../services/user.service'
import { toast } from 'react-toastify'



const isValidate = (date) => {
  return date instanceof Date && !isNaN(date.getTime())
}

function ChatWindow({ selectedContact, setSelectedContact }) {
  //^ STATES:
  const [message, setMessage] = useState("")
  const [filePreview, setFilePreview] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [openMenu, setOpenMenu] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false) // 🔴 NEW STATE FOR UPLOAD STATUS
  const [uploadProgress, setUploadProgress] = useState(0) // 🔴 NEW STATE FOR PROGRESS
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [convertedHEICFile, setConvertedHEICFile] = useState(null)

  const [forceUpdateCounter, setForceUpdateCounter] = useState(0)
  const [contactImageKey, setContactImageKey] = useState(Date.now())
  const [updateKey, setUpdateKey] = useState(0)

  //^ REFS:
  const typingTimeOutRef = useRef(null)
  const messageEndRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const fileMenuRef = useRef(null)
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)
  const filePreviewCleanupRef = useRef(null)
  const displayProgressRef = useRef(0)
  const emojiButtonRef = useRef(null) // 🔴 ADD THIS
  const fileButtonRef = useRef(null)  // 🔴 ADD THIS


  // Store hooks
  const { theme } = useThemeStore()
  const { user } = useUserStore()
  const { conversations, messages, fetchMessages, addReaction, deleteMessage, startTyping, stopTyping,
    isUserTyping, isUserOnline, getUserLastSeen, leaveChatWindow, fetchUserStatus } = useChatStore()
  const socket = getSocket()
  const { clearUser } = useUserStore()


  // Conversation ID
  const currentConversationId = useMemo(() => {
    if (!selectedContact) return null
    const existingConversation = conversations?.data?.find(conv =>
      conv.participants?.some(p => p._id === selectedContact?._id)
    )
    return existingConversation?._id || null
  }, [selectedContact, conversations])


  const { wallpaper, changeWallpaper, getWallpaperStyle } = useWallpaper(
    currentConversationId,
    selectedContact?._id,
    theme
  )




  // Current messages
  const currentMessages = useMemo(() => {
    if (!currentConversationId) return []

    const conversationMessages = messages[currentConversationId] || []
    const uniqueMessages = []
    const seenIds = new Set()

    conversationMessages.forEach(msg => {
      const msgId = msg._id || msg.clientId
      if (msgId && !seenIds.has(msgId)) {
        seenIds.add(msgId)
        uniqueMessages.push(msg)
      }
    })

    return uniqueMessages
  }, [currentConversationId, messages])

  // 🔴 FIX FOR VIDEO DELETE - IMMEDIATE UI UPDATE
  useEffect(() => {
    const handleMessageDeleted = () => {
      // Force re-fetch of messages when video is deleted
      if (currentConversationId) {
        fetchMessages(currentConversationId)
      }
    }

    window.addEventListener('messageDeleted', handleMessageDeleted)

    return () => {
      window.removeEventListener('messageDeleted', handleMessageDeleted)
    }
  }, [currentConversationId, fetchMessages])

  // 🔴 REAL-TIME TYPING STATUS
  const isTyping = isUserTyping(currentConversationId, selectedContact?._id)

  // 🔴 REAL-TIME ONLINE STATUS
  const isOnline = isUserOnline(selectedContact?._id)
  const lastSeen = getUserLastSeen(selectedContact?._id)

  // 🔴 FETCH STATUS
  useEffect(() => {
    if (selectedContact?._id) {
      fetchUserStatus(selectedContact._id)
    }
  }, [selectedContact?._id, fetchUserStatus])


  // 🔴 TRACK WHEN USER IS IN CHAT WINDOW
  useEffect(() => {
    if (!currentConversationId || !user?._id) return

    const socket = getSocket()
    if (!socket) return

    // Emit immediately when component mounts
    socket.emit("user_in_chat_window", {
      conversationId: currentConversationId,
      userId: user._id,
      isInWindow: true
    })

    // Also emit enter_chat_window for badge clearing
    emitEnterChatWindow(currentConversationId)

    // Cleanup when leaving
    return () => {
      socket.emit("user_in_chat_window", {
        conversationId: currentConversationId,
        userId: user._id,
        isInWindow: false
      })

      emitLeaveChatWindow(currentConversationId)
    }
  }, [currentConversationId, user])

  // 🔴 REAL-TIME BLUE TICK LISTENER
  useEffect(() => {
    if (!currentConversationId || !user?._id) return

    const socket = getSocket()
    if (!socket) return

    // Listen for message status updates
    const handleMessageStatusUpdate = ({ messageId, messageStatus, conversationId, immediate }) => {
      if (conversationId === currentConversationId && immediate) {
        useChatStore.setState(state => {
          const updatedMessages = { ...state.messages }
          if (updatedMessages[conversationId]) {
            updatedMessages[conversationId] = updatedMessages[conversationId].map(msg =>
              msg._id === messageId ? { ...msg, messageStatus } : msg
            )
          }
          return { messages: updatedMessages }
        })
      }
    }

    // Listen for badge cleared
    const handleBadgeCleared = ({ conversationId, userId: clearedUserId, immediate }) => {
      if (conversationId === currentConversationId && user._id === clearedUserId && immediate) {
        useChatStore.setState(state => {
          const newUnreadCounts = new Map(state.unreadCounts)
          newUnreadCounts.set(conversationId, 0)
          return { unreadCounts: newUnreadCounts }
        })
      }
    }

    socket.on("message_status_update", handleMessageStatusUpdate)
    socket.on("badge_cleared", handleBadgeCleared)

    return () => {
      socket.off("message_status_update", handleMessageStatusUpdate)
      socket.off("badge_cleared", handleBadgeCleared)
    }
  }, [currentConversationId, user])

  // Handle conversation change
  // 🎯 MODIFIED: FETCH MESSAGES ON CONVERSATION CHANGE & ONLINE SYNC
useEffect(() => {
    if (!selectedContact) {
        setMessage("")
        return
    }

    // 🔴 RE-SYNC WHEN BACK ONLINE
    const handleOnline = () => {
        if (currentConversationId) fetchMessages(currentConversationId);
    };
    window.addEventListener('online', handleOnline);

    // Reset UI states
    setSelectedFile(null);
    setFilePreview(null);
    setFileType(null);
    setOpenMenu(null);

    if (currentConversationId) {
        // 🔥 WHATSAPP STYLE: Check if we already have messages in store
        const hasExistingMessages = messages[currentConversationId]?.length > 0;

        // If we DON'T have messages, show the spinner
        if (!hasExistingMessages) {
            setIsLoadingMessages(true);
        }

        // ALWAYS fetch in background to sync latest messages, 
        // but it won't block the UI if messages already exist.
        fetchMessages(currentConversationId).finally(() => {
            setIsLoadingMessages(false);
        });
    }

    // Auto-focus input
    setTimeout(() => inputRef.current?.focus(), 100);

    return () => {
        window.removeEventListener('online', handleOnline);
    };
}, [selectedContact, currentConversationId, fetchMessages]);



  // 🔴 REAL-TIME PROFILE UPDATE FOR CHAT WINDOW
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedContact?._id) {
      console.log("❌ Socket or selectedContact not available");
      return;
    }

    console.log("🔥 ChatWindow: Setting up REAL-TIME profile update listeners");

    // Handler for profile updates
    const handleContactProfileUpdate = (data) => {
      console.log("🎯 ChatWindow received profile update:", {
        userId: data.userId,
        name: data.username,
        image: data.profilePicture?.slice(0, 30)
      });

      // Check if this update is for the current selected contact
      if (data.userId === selectedContact._id) {
        console.log("✅ This update is for current chat window contact");

        // Create new contact object with updated data
        const updatedContact = {
          ...selectedContact,
          username: data.username || selectedContact.username,
          profilePicture: data.profilePicture || selectedContact.profilePicture,
          about: data.about || selectedContact.about,
          isOnline: data.isOnline !== undefined ? data.isOnline : true,
          lastSeen: data.lastSeen || new Date(),
          updatedAt: new Date().toISOString()
        };

        console.log("🔄 Updating selectedContact with:", {
          oldName: selectedContact.username,
          newName: updatedContact.username,
          oldImg: selectedContact.profilePicture?.slice(0, 30),
          newImg: updatedContact.profilePicture?.slice(0, 30)
        });

        // Update the selected contact in parent component
        setSelectedContact(updatedContact);

        // Force immediate UI update
        setForceUpdateCounter(prev => prev + 1);
        setContactImageKey(Date.now());
        setUpdateKey(prev => prev + 1);

        console.log("✅ ChatWindow header updated successfully!");
      }
    };

    // Set up multiple listeners for reliability
    socket.on("contact_profile_updated", handleContactProfileUpdate);
    socket.on("contact_updated_realtime", handleContactProfileUpdate);
    socket.on("global_profile_update", (data) => {
      if (data.userId === selectedContact._id) {
        handleContactProfileUpdate(data);
      }
    });

    // Clean up on unmount
    return () => {
      console.log("🧹 Cleaning up ChatWindow socket listeners");
      socket.off("contact_profile_updated", handleContactProfileUpdate);
      socket.off("contact_updated_realtime", handleContactProfileUpdate);
      socket.off("global_profile_update");
    };
  }, [selectedContact?._id]) // Only depend on contact ID



  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentConversationId) {
        leaveChatWindow(currentConversationId)
      }

      if (filePreviewCleanupRef.current) {
        filePreviewCleanupRef.current()
      }
    }
  }, [currentConversationId])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messageEndRef.current) {
      requestAnimationFrame(() => {
        messageEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end"
        })
      })
    }
  }, [])


  // Add this helper function in your component 
  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Offline';

    const date = new Date(lastSeen);

    // Check if date is valid
    if (isNaN(date.getTime())) return 'Offline';

    const now = new Date();

    if (isToday(date)) {
      // Today - show only time
      return `last seen today at ${format(date, 'HH:mm')}`;
    } else if (isYesterday(date)) {
      // Yesterday - show "yesterday" + time
      return `last seen yesterday at ${format(date, 'HH:mm')}`;
    } else if (differenceInDays(now, date) <= 7) {
      // Within a week - show day name + time
      return `last seen ${format(date, 'EEEE')} at ${format(date, 'HH:mm')}`;
    } else {
      // More than a week - show date + time
      return `last seen ${format(date, 'dd/MM/yy')} at ${format(date, 'HH:mm')}`;
    }
  }

  //
  useEffect(() => {
    if (currentMessages.length > 0 && !isLoadingMessages) {
      setTimeout(scrollToBottom, 200)
    }
  }, [currentMessages.length, isLoadingMessages])

  // Typing indicator
  const handleTyping = useCallback(() => {
    if (!selectedContact?._id || !currentConversationId) return

    clearTimeout(typingTimeOutRef.current)

    if (message.trim()) {
      startTyping(currentConversationId, selectedContact._id)
      typingTimeOutRef.current = setTimeout(() => {
        stopTyping(currentConversationId, selectedContact._id)
      }, 900)
    } else {
      stopTyping(currentConversationId, selectedContact._id)
    }
  }, [message, selectedContact, currentConversationId])

  //
  useEffect(() => {
    handleTyping()
    return () => {
      clearTimeout(typingTimeOutRef.current)
      if (selectedContact?._id && currentConversationId) {
        stopTyping(currentConversationId, selectedContact._id)
      }
    }
  }, [message])

  // 🔴 HANDLE FILE CHANGE
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // 🔴 VALIDATE FILE SIZE (MAX 500MB)
    const MAX_SIZE = 500 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      alert(`File too large! Maximum 500MB allowed. Your file: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      e.target.value = ''
      return
    }

    // Clean up previous
    if (filePreviewCleanupRef.current) {
      filePreviewCleanupRef.current()
    }

    const isHEIC = file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif') ||
      file.type === 'image/heic' ||
      file.type === 'image/heif'

    try {
      if (isHEIC) {
        const conversionResult = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9
        })

        const convertedBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult
        const convertedFile = new File(
          [convertedBlob],
          file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          { type: 'image/jpeg' }
        )

        setFileType('image')
        const previewUrl = URL.createObjectURL(convertedBlob)
        setFilePreview(previewUrl)
        filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)

        setSelectedFile(file)
        setConvertedHEICFile(convertedFile)

      } else {
        if (file.type.startsWith('image/')) {
          setFileType('image')
          const previewUrl = URL.createObjectURL(file)
          setFilePreview(previewUrl)
          filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)
        } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
          setFileType('video')
          const previewUrl = URL.createObjectURL(file)
          setFilePreview(previewUrl)
          filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)
        } else {
          setFileType('document')
          setFilePreview(null)
          filePreviewCleanupRef.current = null
        }

        setSelectedFile(file)
        setConvertedHEICFile(null)
      }

      setOpenMenu(null)
      e.target.value = ''
      setTimeout(() => inputRef.current?.focus(), 50)

    } catch (error) {
      console.error("❌ File conversion error:", error)

      // Fallback
      setFileType('image')
      const previewUrl = URL.createObjectURL(file)
      setFilePreview(previewUrl)
      filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)
      setSelectedFile(file)
      setConvertedHEICFile(null)
    }
  }


  // 🟢 SMOOTH REAL-LIFE UPLOAD PROGRESS (NO FLICKER)
  const startSmoothUploadProgress = (fileSizeMB) => {
    let startTime = null
    let rafId

    let duration
    if (fileSizeMB < 0.5) duration = 1500
    else if (fileSizeMB < 2) duration = 2200
    else if (fileSizeMB < 5) duration = 3200
    else if (fileSizeMB < 10) duration = 4500
    else duration = 7000

    const animate = (time) => {
      if (!startTime) startTime = time
      const elapsed = time - startTime
      const percent = Math.min(elapsed / duration, 1)

      const target = Math.floor(percent * 92) // 🔴 STOP at 92 (NOT 95)

      if (target > displayProgressRef.current) {
        displayProgressRef.current = target
        setUploadProgress(target)
      }

      if (percent < 1) {
        rafId = requestAnimationFrame(animate)
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }


  // 🎯 SEND MESSAGE FUNCTION - PRODUCTION OPTIMIZED
  const handleSendMessage = async () => {
    let stopProgressAnimation

    if (!selectedContact || !user) return
    if (!message.trim() && !selectedFile) return

    // 🔴 Check if it's a text message or file
    const isTextOnly = !selectedFile && message.trim()
    const isFileMessage = !!selectedFile

    // 🔴 Generate UNIQUE client ID
    const clientId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Store values
    const text = message.trim()
    const file = selectedFile
    const fileTypeCopy = fileType
    const isHEICFile =
      file?.name.toLowerCase().endsWith('.heic') ||
      file?.name.toLowerCase().endsWith('.heif') ||
      file?.type === 'image/heic' ||
      file?.type === 'image/heif'

    // 🔴 Calculate file sizes ONLY if file exists
    const fileSizeBytes = file ? file.size : 0
    const fileSizeMB = file ? file.size / (1024 * 1024) : 0

    // 🔴 Set uploading state ONLY for files
    if (isFileMessage) {
      setIsUploading(true)
      setUploadProgress(0)

      // ✅ START SMOOTH REAL PROGRESS (THIS IS THE USE)
      stopProgressAnimation = startSmoothUploadProgress(fileSizeMB)
    }

    // Clear IMMEDIATELY
    setMessage("")

    // Clear file previews
    if (filePreviewCleanupRef.current) {
      filePreviewCleanupRef.current()
      filePreviewCleanupRef.current = null
    }

    // Reset states
    setSelectedFile(null)
    setConvertedHEICFile(null)
    setFilePreview(null)
    setFileType(null)
    setOpenMenu(null)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    // Stop typing
    setIsSending(true)
    stopTyping(currentConversationId, selectedContact._id)

    try {
      const formData = new FormData()
      formData.append("senderId", user._id)
      formData.append("receiverId", selectedContact._id)
      formData.append("clientId", clientId)

      if (text) {
        formData.append("content", text)
      }

      if (file) {
        const fileToSend = convertedHEICFile || file
        formData.append("media", fileToSend)

        const isVideoFile =
          fileTypeCopy === 'video' ||
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/') ||
          file.name.toLowerCase().endsWith('.mp4') ||
          file.name.toLowerCase().endsWith('.mov') ||
          file.name.toLowerCase().endsWith('.avi') ||
          file.name.toLowerCase().endsWith('.mkv') ||
          file.name.toLowerCase().endsWith('.mp3') ||
          file.name.toLowerCase().endsWith('.wav')

        if (isVideoFile) {
          formData.append("isVideo", "true")
        }

        if (isHEICFile) {
          formData.append("isHEIC", "true")
        }
      }

      // 🔴 ULTIMATE SMART TIMEOUT BASED ON FILE SIZE (PRODUCTION LEVEL)
      let timeout = 12000

      if (file) {
        if (fileSizeMB > 100) timeout = 600000
        else if (fileSizeMB > 50) timeout = 300000
        else if (fileSizeMB > 20) timeout = 180000
        else if (fileSizeMB > 10) timeout = 120000
        else if (fileTypeCopy === 'video' || fileTypeCopy === 'audio') timeout = 90000
        else if (fileTypeCopy === 'image') timeout = 60000
        else if (fileTypeCopy === 'document') timeout = 45000
      }

      console.log(`⏱️ PRODUCTION TIMEOUT: ${timeout}ms for ${fileSizeMB.toFixed(1)}MB ${fileTypeCopy}`)

      // 🔴 UPLOAD REQUEST (NO onUploadProgress — IT CAUSES FLICKER)
      const { data } = await axiosInstance.post("/chat/send-message", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          ...(file && {
            "X-File-Size": fileSizeBytes,
            "X-File-Name": encodeURIComponent(file.name || 'file'),
            "X-File-Type": file.type || fileTypeCopy || 'application/octet-stream',
            "X-Is-Video": fileTypeCopy === 'video' ? "true" : "false",
            "X-Is-HEIC": isHEICFile ? "true" : "false",
            "X-Sender-Id": user._id,
            "X-Receiver-Id": selectedContact._id,
            "X-Client-Timestamp": Date.now()
          })
        },
        timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })

      // ✅ CLEAN FINISH (ALWAYS 95 → 100)
      if (isFileMessage) {
        if (stopProgressAnimation) {
          stopProgressAnimation()
        }

        // 🔥 WhatsApp-style final push
        setUploadProgress(prev => Math.max(prev, 96))

        setTimeout(() => {
          setUploadProgress(100)

          setTimeout(() => {
            setIsUploading(false)
            setUploadProgress(0)
            displayProgressRef.current = 0
          }, 120)
        }, 180)
      }

      if (!data) {
        throw new Error("No response from server")
      }

      const savedMessage = data.data || data
      if (!savedMessage) {
        throw new Error("Invalid response format")
      }

      setIsSending(false)
      return savedMessage

    } catch (error) {
      console.error("❌ Send failed:", error)

      if (stopProgressAnimation) {
        stopProgressAnimation()
      }

      let errorMessage = "Send failed. Please try again."

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = "Server is taking too long to respond. Please try again."
      } else if (error.response?.status === 413) {
        errorMessage = "File too large! Maximum 500MB allowed."
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }

      if (isFileMessage) {
        alert(`Upload failed: ${errorMessage}`)
      }

      // Revert message
      setMessage(text)
      if (file) {
        setSelectedFile(file)
        if (fileTypeCopy === 'image' || fileTypeCopy === 'video') {
          const previewUrl = URL.createObjectURL(file)
          setFilePreview(previewUrl)
          filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)
        }
        setFileType(fileTypeCopy)
      }

      setIsUploading(false)
      setIsSending(false)
      throw error

    } finally {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }


  // Group messages
  const groupedMessages = useMemo(() => {
    if (!currentMessages.length) return {}

    const grouped = {}
    const seenIds = new Set()

    currentMessages.forEach(msg => {
      if (!msg.createdAt) return

      const msgId = msg._id || msg.clientId
      if (seenIds.has(msgId)) return
      seenIds.add(msgId)

      const date = new Date(msg.createdAt)
      if (isValidate(date)) {
        const dateString = format(date, "yyyy-MM-dd")
        if (!grouped[dateString]) {
          grouped[dateString] = []
        }
        grouped[dateString].push(msg)
      }
    })
    return grouped
  }, [currentMessages])

  // Truncate long filenames
  const truncateFileName = (name, maxLength = 25) => {
    if (!name) return ''
    if (name.length <= maxLength) return name

    const parts = name.split('.')
    if (parts.length > 1) {
      const extension = parts.pop()
      const nameWithoutExt = parts.join('.')
      if (nameWithoutExt.length <= maxLength - extension.length - 3) {
        return name
      }
      return `${nameWithoutExt.substring(0, maxLength - extension.length - 4)}....${extension}`
    }

    return name.length > maxLength ? name.substring(0, maxLength - 3) + '...' : name
  }

  // Close pickers
  useEffect(() => {
    const handleClickOutside = (e) => {
      // EMOJI PICKER এর জন্য
      if (openMenu === "emoji") {
        const isClickOnEmojiButton = emojiButtonRef.current &&
          (emojiButtonRef.current === e.target ||
            emojiButtonRef.current.contains(e.target))

        const isClickInsideEmojiPicker = emojiPickerRef.current &&
          (emojiPickerRef.current === e.target ||
            emojiPickerRef.current.contains(e.target))

        // যদি emoji button এর বাইরে এবং emoji picker এর বাইরে ক্লিক হয়, তাহলে close করো
        if (!isClickOnEmojiButton && !isClickInsideEmojiPicker) {
          setOpenMenu(null)
        }
      }

      // FILE MENU এর জন্য
      if (openMenu === "file") {
        const isClickOnFileButton = fileButtonRef.current &&
          (fileButtonRef.current === e.target ||
            fileButtonRef.current.contains(e.target))

        const isClickInsideFileMenu = fileMenuRef.current &&
          (fileMenuRef.current === e.target ||
            fileMenuRef.current.contains(e.target))

        // যদি file button এর বাইরে এবং file menu এর বাইরে ক্লিক হয়, তাহলে close করো
        if (!isClickOnFileButton && !isClickInsideFileMenu) {
          setOpenMenu(null)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openMenu]) // 🔴 IMPORTANT: Add openMenu as dependency

  //
  const handleReaction = (messageId, emoji) => {
    addReaction(messageId, emoji)
  }

  // 🔴 DELETE MESSAGE
  const handleDeleteMessage = async (messageId, deleteForEveryone = null) => {
    try {
      await deleteMessage(messageId, deleteForEveryone)

      // 🔴 INSTANT CHAT LIST UPDATE
      setTimeout(() => {
        useChatStore.getState().fetchConversations()
      }, 300)

    } catch (error) {
      console.error("Delete message error:", error)
      alert("Failed to delete message")
    }
  }

  // 🔴 SEXY SPINNER COMPONENT
  const SexySpinner = React.memo(() => (
    <motion.div
      className="relative flex items-center justify-center"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
    >
      {/* Main spinner container - Mobile responsive */}
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14">
        {/* Outer ring - glowing pulse */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400/20 via-cyan-400/20 to-blue-400/20 animate-pulse"></div>

        {/* Spinning rings - Responsive border widths */}
        <div className="absolute inset-0 border-[2px] sm:border-[3px] border-transparent border-t-green-400 border-r-cyan-400 rounded-full animate-spin"></div>
        <div className="absolute inset-1 border-[1.5px] sm:border-[2px] border-transparent border-b-blue-400 border-l-purple-400 rounded-full animate-spin-reverse"
          style={{ animationDuration: '0.8s' }}></div>
        <div className="absolute inset-2 border-[1px] sm:border-[1.5px] border-transparent border-t-pink-400 border-r-yellow-400 rounded-full animate-spin"
          style={{ animationDuration: '1.2s' }}></div>

        {/* Center dot - Responsive sizing */}
        <div className="absolute inset-2 sm:inset-3 md:inset-4 bg-gradient-to-r from-green-400 to-cyan-400 rounded-full animate-pulse"></div>

        {/* Shimmer effect */}
        <div className="absolute -inset-1 sm:-inset-1 md:-inset-1 bg-gradient-to-r from-green-400/30 via-transparent to-cyan-400/30 rounded-full blur-sm animate-pulse"></div>
      </div>

      {/* Progress percentage (optional) */}
      {uploadProgress > 0 && uploadProgress < 100 && (
        <div
          className="absolute -bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2"
        >
          <span className="text-xs font-semibold bg-gradient-to-r from-green-500 to-cyan-500 bg-clip-text text-transparent tabular-nums select-none">
            {uploadProgress}%
          </span>
        </div>
      )}
    </motion.div>
  ))


  //!  For Video Call Manager
  const handleVideoCall = () => {
    if (selectedContact && isOnline) {
      const { initiateCall } = useVideoCallStore.getState()

      const avatar = selectedContact?.profilePicture

      initiateCall(
        selectedContact?._id,
        selectedContact?.username,
        avatar,
        "video"
      )
    } else {
      alert("User is offline. Can't initiate the call")
    }
  }




  if (!selectedContact) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center mx-auto h-screen text-center'>
        <div className='max-w-md'>
          <img src={whatsappImage} alt='chat-app' className='w-full h-auto' />
          <h2 className={`text-[1.15rem] sm:text-2xl font-semibold mb-4 ${theme === 'dark' ? "text-white" : "text-black"}`}>
            Select a conversation to start chatting
          </h2>
          <p className={`mb-6 ${theme === 'dark' ? "text-gray-400" : "text-gray-600"}`}>
            Choose any contact from the list on the left to start messaging
          </p>
          <p className={`text-sm mt-8 flex items-center justify-center gap-2 ${theme === 'dark' ? "text-gray-400" : "text-gray-800"}`}>
            <FaLock className='w-4 h-4 text-green-700' />
            <span className='font-semibold text-green-600'>end-to-end encrypted</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/*//^ 🔴 UPLOADING OVERLAY */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            {/*//&  Uploading container - Mobile responsive */}
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-4 sm:p-6 md:p-8
               shadow-2xl max-w-xs sm:max-w-sm md:max-w-md mx-auto w-full border border-gray-700"
            >
              {/*//~  Sexy Spinner */}
              <div className="flex justify-center mb-4 sm:mb-6">
                <SexySpinner />
              </div>

              {/*//~  Uploading text */}
              <div className="text-center">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-1 sm:mb-2">
                  Uploading {fileType === 'image' ? 'Image' : fileType === 'video' ? 'Video' : 'File'}
                </h3>
                <p className="text-sm text-gray-300 mb-3 sm:mb-4 truncate">
                  {selectedFile?.name && truncateFileName(selectedFile.name, 30)}
                </p>

                {/*//&  Progress bar */}
                <div className="w-full bg-gray-700 rounded-full h-2.5 mb-3 sm:mb-4">
                  <motion.div
                    className="h-2.5 rounded-full bg-gradient-to-r from-green-500 via-cyan-500 to-blue-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.25, ease: "linear" }}
                  ></motion.div>
                </div>
                {/*//&  Size info */}
                {selectedFile && (
                  <p className="text-xs sm:text-sm text-gray-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • {uploadProgress}% Complete
                  </p>
                )}
              </div>
            </motion.div>

            {/*//&  Note text - Mobile responsive */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-gray-400 text-xs sm:text-sm mt-4 sm:mt-6 text-center max-w-xs sm:max-w-md px-2"
            >
              Please wait while we securely upload your file.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>


      <div className='flex-1 h-screen w-full flex flex-col relative no-shake'>
        {/*//&  ANIMATED HEADER */}
        <div
          key={`header-${selectedContact?._id}-${forceUpdateCounter}`}
          className={`pt-4 pr-4 pb-2 flex items-center 
            ${theme === 'dark'
              ? "bg-gradient-to-r from-gray-900 to-gray-800 text-white"
              : "bg-gray-50 border-b border-gray-200 text-gray-700"
            }
          `}
        >
          {/*//* [1] Back button  */}
          <button
            onClick={() => {
              if (currentConversationId) {
                leaveChatWindow(currentConversationId)
              }
              setSelectedContact(null)
            }}
            className={` group relative ml-1 mb-1 flex items-center justify-center h-9 w-9 rounded-full
              transition-all duration-300 ease-out hover:scale-110 focus:outline-none cursor-pointer
              ${theme === 'dark' ? 'hover:bg-green-400/20' : 'hover:bg-green-500/5'}   
            `}
          >
            {/*//^ Glow */}
            <span
              className={` absolute inset-0 rounded-full blur-md transition duration-300
                ${theme === 'dark'
                  ? 'bg-green-400 opacity-0 group-hover:opacity-40'
                  : 'bg-green-500 opacity-0 group-hover:opacity-20'}
              `}
            />
            <FaArrowLeft
              className={` relative h-5 w-5 transition-colors duration-300
                ${theme === 'dark'
                  ? 'text-green-600 group-hover:text-green-400'
                  : 'text-green-500 group-hover:text-green-600'}
              `}
            />
          </button>

          {/*//* [2] Profile Image  */}
          <div className="flex items-center">
            <motion.div
              key={`profile-container-${contactImageKey}`}
              className="w-12 h-12 flex-shrink-0 ml-2 rounded-full overflow-hidden bg-gradient-to-r from-green-400 to-cyan-400 p-0.5"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                delay: 0.15,
                stiffness: 200,
                damping: 15
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-white">
                <motion.img
                  key={`profile-img-${contactImageKey}`}
                  src={selectedContact?.profilePicture}
                  alt={selectedContact?.username}
                  className="min-w-full min-h-full object-cover"
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${selectedContact?.username}&background=random`;
                  }}
                />
              </div>
            </motion.div>
          </div>

          {/*//* [3] Contact Info  */}
          <div className='ml-2 sm:ml-3 flex-grow'>
            <motion.h2
              key={`name-${forceUpdateCounter}`}
              className='font-semibold text-start truncate max-w-[150px] sm:max-w-none break-all'
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, type: "spring", stiffness: 300 }}
            >
              {selectedContact?.username}
            </motion.h2>

            {/*//^ 🔴 REAL-TIME STATUS LINE */}
            <div className="h-5 flex items-center min-w-[185px]">
              <motion.p
                className={`text-xs sm:text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                  } truncate max-w-[150px] sm:max-w-none break-all `}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                {isTyping ? (
                  <span className="flex items-center text-green-500 font-semibold">
                    <span
                      className="h-1.5 w-1.5 bg-green-500 rounded-full mr-2 text-base"
                    />
                    typing...
                  </span>
                ) : isOnline ? (
                  <span className="flex items-center text-green-500 text-sm">
                    <span className="h-2 w-2 bg-green-500 rounded-full mr-1" />
                    Online
                  </span>
                ) : lastSeen ? (
                  <span className="text-gray-400">
                    {formatLastSeen(lastSeen)}
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">Offline</span>
                )}
              </motion.p>
            </div>
          </div>

          <div className="flex items-center ">
            {/*//~ Video Call Button */}
            <button
              onClick={handleVideoCall}   //& 'handleVideoCall' is defined at the above
              title={isOnline ? "Start Video Calling" : "User is offline"}
              className={` group relative flex items-center justify-center h-10 w-10 rounded-full -right-1.5
                transition-all duration-300 ease-out hover:scale-110 focus:outline-none cursor-pointer
                ${theme === 'dark' ? 'hover:bg-green-400/20' : 'hover:bg-green-500/5'}
              `}
            >
              {/*//^  Glow */}
              <span
                className={` absolute inset-0 rounded-full blur-md transition duration-300
                  ${theme === 'dark'
                    ? 'bg-green-400 opacity-0 group-hover:opacity-40'
                    : 'bg-green-500 opacity-0 group-hover:opacity-20'}
                `}
              />

              <FaVideo
                className={` relative h-5.5 w-5.5 transition-colors duration-300
                  ${theme === 'dark' ? 'text-green-600 group-hover:text-green-400' : 'text-green-500 group-hover:text-green-600'}
                `}
              />
            </button>

            {/*//~  More Options Button */}
            <ChatOptionsMenu
              theme={theme}
              conversationId={currentConversationId}
              onClearChat={async () => {
                if (!currentConversationId) return
                const success = await useChatStore.getState().clearChat(currentConversationId)
                if (success) toast.success('Chat cleared')
                else toast.error('Failed to clear chat')
              }}
              onWallpaperChange={(type, value) => {
                if (type === 'reset') {
                  changeWallpaper('')
                } else if (type === 'color') {
                  changeWallpaper(value)
                } else if (type === 'image') {
                  changeWallpaper(`url(${value})`)
                }
              }}
              onLogout={async () => {
                try {
                  await logOutUser()
                  clearUser()
                  toast.success('Logged out')
                } catch (error) {
                  toast.error('Logout failed')
                }
              }}
            />
          </div>
        </div>

        {/*//&  Messages Area */}
        <div
          key={currentConversationId || `new-${selectedContact?._id}`}
          className="flex-1 p-4 overflow-y-auto messages-container sticky-scroll no-scrollbar scroll-smooth"
          style={getWallpaperStyle()}
        >
          {isLoadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="relative">
                <div className="h-16 w-16 border-4 border-transparent border-t-green-400 border-r-cyan-400 rounded-full animate-spin"></div>
                <div className="absolute inset-4 border-4 border-transparent border-b-blue-400 border-l-purple-400 rounded-full animate-spin-reverse"></div>
              </div>
              <p className="text-gray-500 text-sm mt-4">Loading messages...</p>
            </div>
          ) : (
            <>
              {Object.keys(groupedMessages).length > 0 ? (
                Object.entries(groupedMessages).map(([date, msgs]) => (
                  <React.Fragment key={date}>
                    <div className='flex justify-center my-4'>
                      <span className={`px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r ${theme === 'dark'
                        ? "from-gray-800 to-gray-700 text-gray-300"
                        : "from-blue-50 to-cyan-50 text-gray-600"
                        }`}>
                        {isToday(new Date(date)) ? "Today" : isYesterday(new Date(date)) ? "Yesterday" : format(new Date(date), "MMMM d, yyyy")}
                      </span>
                    </div>
                    {msgs.map(msg => (
                      <MessageBubble
                        key={msg._id || msg.clientId}
                        message={msg}
                        theme={theme}
                        currentUser={user}
                        onReact={handleReaction}
                        deleteMessage={handleDeleteMessage}
                        maxWidth="90vw"
                        captionOverflow="break-word"
                      />
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full"
                >
                  <div className="text-center max-w-sm">
                    <div className="mb-6">
                      <div className="h-24 w-24 mx-auto rounded-full bg-gradient-to-r from-green-100 to-cyan-100 flex items-center justify-center">
                        <div className="h-16 w-16 rounded-full bg-gradient-to-r from-green-200 to-cyan-200 flex items-center justify-center">
                          <FaPaperPlane className="h-8 w-8 text-green-600" />
                        </div>
                      </div>
                    </div>
                    <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      Start a conversation
                    </h3>
                    <p className={`mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      Send your first message to begin chatting with {selectedContact?.username}
                    </p>
                    <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'}`}>
                      <p className="text-sm text-gray-500">
                        <FaCheckCircle className="inline h-4 w-4 text-green-500 mr-2" />
                        Messages are encrypted end-to-end
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
          <div ref={messageEndRef} />
        </div>

        {/*//&  Render file preview */}
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full px-2 mb-2"
          >
            <div className="w-full flex justify-center">
              <div className="w-full max-w-full" style={{
                maxWidth: 'min(95vw, 400px)',
                margin: '0 auto'
              }}>
                {/*//~  Image preview */}
                {fileType === 'image' && filePreview && (
                  <div className="relative group w-full">
                    <div className="relative rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 shadow-lg"
                      style={{
                        height: '180px',
                        maxHeight: '200px',
                        width: '100%'
                      }}>
                      <motion.img
                        src={filePreview}
                        alt='preview'
                        className='w-full h-full object-contain rounded-xl'
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.2 }}
                      />

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (filePreviewCleanupRef.current) {
                            filePreviewCleanupRef.current()
                            filePreviewCleanupRef.current = null
                          }
                          setSelectedFile(null)
                          setConvertedHEICFile(null)
                          setFilePreview(null)
                          setFileType(null)
                          inputRef.current?.focus()
                        }}
                        className='absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg z-10'
                      >
                        <FaTimes className='h-3.5 w-3.5' />
                      </motion.button>

                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)}MB
                      </div>
                    </div>
                  </div>
                )}

                {/*//~  Video preview */}
                {fileType === 'video' && filePreview && (
                  <div className="relative group w-full">
                    <div className="relative rounded-xl overflow-hidden bg-black shadow-lg"
                      style={{
                        height: '180px',
                        maxHeight: '200px',
                        width: '100%'
                      }}>
                      <video
                        src={filePreview}
                        controls
                        className='w-full h-full object-contain rounded-xl'
                        playsInline
                      />

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (filePreviewCleanupRef.current) {
                            filePreviewCleanupRef.current()
                            filePreviewCleanupRef.current = null
                          }
                          setSelectedFile(null)
                          setFilePreview(null)
                          setFileType(null)
                          inputRef.current?.focus()
                        }}
                        className='absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg z-20'
                      >
                        <FaTimes className='h-3.5 w-3.5' />
                      </motion.button>

                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full flex items-center">
                        <FaVideo className="h-3 w-3 mr-1" />
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)}MB
                      </div>
                    </div>
                  </div>
                )}

                {/*//~  Document preview */}
                {fileType === 'document' && (
                  <div className="relative w-full flex justify-center">
                    <div className="w-full max-w-[100%] ">
                      <div
                        className={`w-full p-3 rounded-xl shadow-lg flex items-center space-x-3 relative ${theme === 'dark'
                          ? 'bg-gray-800/80'
                          : 'bg-gray-100/80'
                          }`}
                        style={{ height: '80px' }}
                      >
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            setSelectedFile(null)
                            setFilePreview(null)
                            setFileType(null)
                            inputRef.current?.focus()
                          }}
                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg"
                        >
                          <FaTimes className="h-3.5 w-3.5" />
                        </motion.button>

                        <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <FaFile className="h-6 w-6 text-blue-500" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="mb-1 max-w-full overflow-hidden">
                            <p
                              className={`font-medium truncate text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'
                                }`}
                            >
                              {truncateFileName(selectedFile.name, 25)}
                            </p>
                          </div>

                          <p className="text-xs text-gray-500 truncate">
                            {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/*//&  Input Area */}
        <div className={`relative p-2.5 sm:px-4 sm:py-4 flex items-center space-x-2 ${theme === 'dark'
          ? "bg-gradient-to-r from-gray-900 to-gray-800 border-t border-gray-700"
          : "bg-gradient-to-r from-white to-gray-50 border-t border-gray-200"
          }`}>

          {/* // * Emoji Button */}
          <button
            ref={emojiButtonRef} // 🔴 Attach the ref
            onClick={() => {
              console.log("Emoji button clicked. Current openMenu:", openMenu)
              // Toggle logic
              if (openMenu === "emoji") {
                setOpenMenu(null) // Close if already open
              } else {
                setOpenMenu("emoji") // Open if closed
              }
            }}
            className='focus:outline-none hover:scale-110 transition-transform cursor-pointer'
            disabled={isSending || isUploading}
          >
            <FaSmile className={`h-6 w-6 ${theme === 'dark'
              ? "text-gray-400 hover:text-yellow-400"
              : "text-[#61717a] hover:text-yellow-500"
              } transition-colors ${(isSending || isUploading) ? 'opacity-50' : ''}`} />
          </button>

          {/* //^ Open Emoji Picker after clicking 'Emoji Button'  */}
          <AnimatePresence>
            {openMenu === "emoji" && (
              <motion.div
                ref={emojiPickerRef}
                className='absolute left-2 bottom-18 z-50 w-[300px] h-[340px] sm:w-[320px] sm:h-[400px] rounded-2xl bg-gradient-to-br from-white/95 to-gray-100/95 backdrop-blur-xl shadow-2xl'
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: "spring", damping: 25 }}
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiPicker
                  width="100%"
                  height="100%"
                  onEmojiClick={(emojiObject) => {
                    setMessage(prev => prev + emojiObject.emoji)
                    setOpenMenu(null)
                  }}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className='relative'>
            {/* //* File Icon  */}
            <button
              ref={fileButtonRef} // 🔴 Attach the ref
              onClick={() => {
                console.log("File button clicked. Current openMenu:", openMenu)
                // Toggle logic
                if (openMenu === "file") {
                  setOpenMenu(null) // Close if already open
                } else {
                  setOpenMenu("file") // Open if closed
                }
              }}
              className='focus:outline-none hover:scale-110 transition-transform cursor-pointer'
              disabled={isSending || isUploading}
            >
              <FaPaperclip className={`h-5 w-5 mt-1 -rotate-45 ${theme === 'dark'
                ? "text-gray-400 hover:text-blue-400"
                : "text-[#54656F] hover:text-blue-500"
                } transition-colors ${(isSending || isUploading) ? 'opacity-50' : ''}`} />
            </button>

            {/* //^ Open Documents/Img/Vdo after clicking 'File Icon'  */}
            <AnimatePresence>
              {openMenu === "file" && (
                <motion.div
                  ref={fileMenuRef}
                  className={`absolute -left-2 bottom-full mb-2 rounded-xl shadow-xl w-48 z-50 overflow-hidden backdrop-blur-md ${theme === 'dark'
                    ? "bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-gray-300"
                    : "bg-gradient-to-b from-white to-gray-50 border border-gray-200 text-gray-700"
                    }`}
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type='file'
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept='image/*, video/*, audio/*, .pdf, .doc, .docx, .txt, .xls, .xlsx, .ppt, .pptx, .heic, .heif'
                    className='hidden'
                  />
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className={`flex items-center px-4 py-3 w-full transition-all hover:bg-gradient-to-r 
                      ${theme === 'dark'
                        ? "hover:from-gray-600 hover:to-gray-500"
                        : "hover:from-blue-50 hover:to-green-100"
                      }`}
                    disabled={isSending || isUploading}
                  >
                    <FaImage className='mr-3' />
                    <span className="font-medium">Image/Video</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current.click()}
                    className={`flex items-center px-4 py-3 w-full transition-all hover:bg-gradient-to-r ${theme === 'dark'
                      ? "hover:from-gray-600 hover:to-gray-500"
                      : "hover:from-blue-50 hover:to-green-100"
                      }`}
                    disabled={isSending || isUploading}
                  >
                    <FaFile className='mr-3' />
                    <span className="font-medium">Documents</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <input
            ref={inputRef}
            type='text'
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (message.trim() || selectedFile) && !isSending && !isUploading) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder={isUploading ? 'Uploading...' : 'Type a message...'}
            className={`flex-grow p-3 sm:px-4 sm:py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent shadow-sm 
              ${theme === 'dark'
                ? "bg-gray-700 text-white border-gray-600 placeholder-gray-300"
                : "bg-gray-50 text-black border-gray-300 placeholder-gray-500"
              } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isSending || isUploading}
            autoFocus
          />

          <motion.button
            whileHover={{ scale: isUploading || isSending ? 1 : 1.05 }}
            whileTap={{ scale: isUploading || isSending ? 1 : 0.95 }}
            onClick={handleSendMessage}
            className={`w-11 h-11 flex items-center justify-center rounded-full shadow-lg transition-all cursor-pointer 
      bg-gradient-to-r from-green-500 to-cyan-500
      ${(isUploading || isSending) ? 'opacity-75 cursor-not-allowed' : 'hover:from-green-600 hover:to-cyan-600'}`}
            disabled={isUploading || isSending || (!message.trim() && !selectedFile)}
          >
            {isUploading || isSending ? (
              <FaSpinner className="h-4 w-4 text-white animate-spin" />
            ) : (
              <FaPaperPlane className="h-5 w-5 text-white rotate-45" />
            )}
          </motion.button>
        </div>
      </div>

      {/*// !  This is from /src/pages/VideoCall/VideoCallManager.jsx file.  */}
      <VideoCallManager socket={socket} />
    </>
  )
}

export default ChatWindow