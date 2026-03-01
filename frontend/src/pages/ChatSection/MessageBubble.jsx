import { format } from 'date-fns'
import EmojiPicker from 'emoji-picker-react'
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react'
import {
  FaCheck, FaCheckDouble, FaPlus, FaSmile, FaFile, FaFilePdf, FaFileWord, FaFileExcel, FaFilePowerpoint,
  FaFileAlt, FaDownload, FaSpinner, FaVideo, FaImage, FaCopy, FaTrash, FaEye, FaFileAudio
} from 'react-icons/fa'
import { HiDotsVertical } from 'react-icons/hi'
import { motion, AnimatePresence } from 'framer-motion'

function MessageBubble({ message, theme, currentUser, onReact, deleteMessage }) {
  //! STATES:
  const [showReactions, setShowReactions] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [openMenu, setOpenMenu] = useState(null)
  const [openUpward, setOpenUpward] = useState(true)
  const [videoError, setVideoError] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })
  const [pickerDirection, setPickerDirection] = useState('upward') //^ 'upward' or 'downward'
  const [isMobile, setIsMobile] = useState(false)
  const [mediaLoaded, setMediaLoaded] = useState(false)

  //! REFS:
  const messageRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const reactionsMenuRef = useRef(null)
  const reactionTimerRef = useRef(null)
  const optionsRef = useRef(null)
  const videoRef = useRef(null)

  const isCurrentUser = message.sender?._id === currentUser?._id

  //! WhatsApp-style message bubble
  const bubbleClass = isCurrentUser ? `chat-end mb-3` : `chat-start mb-3`

  const bubbleContentClass = isCurrentUser
    ? `chat-bubble max-w-[80%] sm:max-w-[50%] min-w-[130px] ${theme === 'dark' ? "bg-[#144d38] text-white" : "bg-[#d9fdd3] text-black"}`
    : `chat-bubble max-w-[80%] sm:max-w-[50%] min-w-[130px] ${theme === 'dark' ? "bg-[#202c33] text-white" : "bg-white text-black"}`

  const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

  //! 🔴 Get file icon
  const getFileIcon = () => {
    if (!message.fileType && !message.imageOrVideoUrl) return <FaFile className="h-6 w-6 text-gray-500" />

    const fileType = message.fileType || ''
    const url = message.imageOrVideoUrl || ''

    if (fileType.includes('pdf') || url.includes('.pdf')) return <FaFilePdf className="h-6 w-6 text-red-500" />
    if (fileType.includes('word') || fileType.includes('msword') || url.includes('.doc')) return <FaFileWord className="h-6 w-6 text-blue-500" />
    if (fileType.includes('excel') || fileType.includes('sheet') || url.includes('.xls')) return <FaFileExcel className="h-6 w-6 text-green-500" />
    if (fileType.includes('powerpoint') || fileType.includes('presentation') || url.includes('.ppt')) return <FaFilePowerpoint className="h-6 w-6 text-orange-500" />
    if (fileType.includes('text') || fileType.includes('plain') || url.includes('.txt')) return <FaFileAlt className="h-6 w-6 text-gray-500" />
    if (fileType.includes('zip') || fileType.includes('rar') || url.includes('.zip') || url.includes('.rar')) return <FaFile className="h-6 w-6 text-purple-500" />

    return <FaFile className="h-6 w-6 text-gray-500" />
  }

  //! 🔴 Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  //! 🔴 Format video duration
  const formatVideoDuration = (seconds) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  //! 🔴 Truncate filename
  const truncateFileName = (name, maxLength = 25) => {
    if (!name) return ''
    if (name.length <= maxLength) return name

    const extension = name.split('.').pop()
    const nameWithoutExt = name.substring(0, name.length - extension.length - 1)

    if (nameWithoutExt.length <= maxLength - extension.length - 3) {
      return name
    }

    return `${nameWithoutExt.substring(0, maxLength - extension.length - 4)}....${extension}`
  }

  //! Get file name for display
  const getFileName = () => {
    if (message.fileName) {
      return truncateFileName(message.fileName, 30)
    }
    if (message.imageOrVideoUrl) {
      const urlParts = message.imageOrVideoUrl.split('/')
      const fileName = urlParts[urlParts.length - 1].split('?')[0]
      return truncateFileName(fileName, 25)
    }
    return 'Document'
  }

  //! 🔴 Format file type for mobile
  const formatFileTypeForMobile = (fileType) => {
    if (!fileType) return 'FILE'
    if (fileType.includes('vnd.openxmlformats-officedocument.wordprocessingml.document')) return 'DOCX'
    if (fileType.includes('vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return 'XLSX'
    if (fileType.includes('vnd.openxmlformats-officedocument.presentationml.presentation')) return 'PPTX'
    if (fileType.includes('msword')) return 'DOC'
    if (fileType.includes('pdf')) return 'PDF'
    if (fileType.includes('text')) return 'TXT'
    if (fileType.includes('zip')) return 'ZIP'
    if (fileType.includes('rar')) return 'RAR'
    return fileType.split('/').pop()?.toUpperCase() || 'FILE'
  }

  //! 🔴 Handle video error
  const handleVideoError = () => {
    console.error("❌ Video failed to load:", message.imageOrVideoUrl)
    setVideoError(true)
  }

  //! 🔴 Handle image error
  const handleImageError = () => {
    console.error("❌ Image failed to load:", message.imageOrVideoUrl)
    setImageError(true)
  }

  //! 🔴 Cleanup video/audio on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ''
        videoRef.current.load()
      }
    }
  }, [])

  //! 🔴 Check if mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  //! 🔴 Render content based on type
  const renderMessageContent = () => {
    const isOptimistic = message.isOptimistic || message.messageStatus === 'sending'

    //& Check if it's an audio file
    const isAudio = message.fileType && message.fileType.startsWith('audio/')

    switch (message.contentType) {
      case "text":
        return (
          <p className="text-base text-left leading-snug break-words whitespace-normal 
            [text-wrap:balance] md:[text-wrap:wrap]">
            {message.content}
          </p>
        )

      //^ [1] Image
      case "image":
        if (imageError) {
          return (
            <div className="mt-2 p-4 rounded-lg {`mt-2 p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}  flex items-center justify-center">
              <FaImage className="h-6 w-6 text-gray-500 mr-2" />
              <span className="text-gray-500">Image not available</span>
            </div>
          )
        }

        if (isOptimistic && message.media) {
          return message.imageOrVideoUrl ? (
            <div className="mt-2 max-w-[55%] sm:max-w-[70%]">
              <div className="relative overflow-hidden rounded-lg">
                <img
                  src={message.imageOrVideoUrl}
                  alt="message"
                  className="w-full h-auto max-h-[300px] sm:max-h-[400px] object-contain cursor-pointer"
                  onClick={() => window.open(message.imageOrVideoUrl, '_blank')}
                  onError={handleImageError}
                />
                {/* Loading Overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <FaSpinner className="h-8 w-8 animate-spin mx-auto" />
                    <p className="mt-2">Uploading...</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 p-4 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center">
              <FaImage className="h-6 w-6 text-gray-500 mr-2" />
              <span className="text-gray-500">Image</span>
            </div>
          )
        }

        return message.imageOrVideoUrl ? (
          <div className="mt-2">
            <div style={{ opacity: mediaLoaded ? 1 : 0, transition: 'opacity 0.2s' }}>
              <img
                src={message.imageOrVideoUrl}
                alt="message"
                className="max-w-full h-auto rounded-lg cursor-pointer"
                onClick={() => window.open(message.imageOrVideoUrl, '_blank')}
                onError={handleImageError}
                onLoad={() => setMediaLoaded(true)}
              />

              {message.content && (
                <p className={`mt-2 ml-2 ${isMobile ? "text-sm" : "text-base"} ${theme === 'dark' ? "text-gray-100" : "text-gray-900"}`}>
                  {message.content}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-2 p-4 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center">
            <FaImage className="h-4 w-4 text-gray-500 mr-2" />
            <span className="text-gray-400">Image</span>
          </div>
        )



      //^ [2] Video or Audio
      case "video":
        if (videoError) {
          return (
            <div className="mt-2 p-4 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {isAudio ? (
                <FaFileAudio className="h-6 w-6 text-gray-500 mr-2" />
              ) : (
                <FaVideo className="h-6 w-6 text-gray-500 mr-2" />
              )}
              <span className="text-gray-500">{isAudio ? 'Audio' : 'Video'} not available</span>
            </div>
          )
        }

        if (isOptimistic && message.media) {
          return (
            <div className="mt-2">
              <div className="relative w-full bg-black rounded-lg overflow-hidden">
                {isAudio ? (
                  <audio
                    ref={videoRef}
                    src={message.imageOrVideoUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                    onError={handleVideoError}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={message.imageOrVideoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full object-contain block max-h-[60vh]"
                    onError={handleVideoError}
                    onLoadedData={() => setVideoError(false)}
                  />
                )}
                {/* Loading Overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <FaSpinner className="h-8 w-8 animate-spin mx-auto" />
                    <p className="mt-2">Uploading...</p>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        return (
          <div className="mt-2">
            <div style={{ opacity: mediaLoaded ? 1 : 0, transition: 'opacity 0.2s' }}>
              <div className="relative w-full bg-black rounded-lg overflow-hidden">
                {isAudio ? (
                  <audio
                    ref={videoRef}
                    src={message.imageOrVideoUrl}
                    controls
                    preload="metadata"
                    className="w-full"
                    onError={handleVideoError}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={message.imageOrVideoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full object-contain block max-h-[60vh]"
                    onError={handleVideoError}
                    onLoadedData={() => setMediaLoaded(true)} 
                  />
                )}
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full flex items-center z-10">
                  {isAudio ? (
                    <FaFileAudio className="h-4 w-4 mr-1" />
                  ) : (
                    <FaVideo className="h-4 w-4 mr-1" />
                  )}
                  {message.duration ? formatVideoDuration(message.duration) : ""}
                  {message.fileSize && ` • ${formatFileSize(message.fileSize)}`}
                </div>
              </div>
              {/* 🔥 CAPTION HERE - for optimistic state */}
              {message.content && (
                <p className={`mt-2 ml-2 ${isMobile ? "text-sm" : "text-base"} ${theme === 'dark' ? "text-gray-100" : "text-gray-900"}`} >
                  {message.content}
                </p>
              )}
            </div>
          </div>
        )



      //^ [3] Document
      case "document":
        if (isOptimistic) {
          const optimisticFileName = getFileName()

          return (
            <div className={`mt-2 p-3 rounded-lg flex items-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <FaSpinner className="h-6 w-6 text-blue-500 animate-spin mr-3" />
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  {optimisticFileName}
                </p>
                <p className="text-xs text-gray-500">
                  Uploading document...
                </p>
              </div>
            </div>
          )
        }

        const displayFileType = formatFileTypeForMobile(message.fileType)

        return (
          <div>
            <div className={`mt-2 p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div className="flex items-center gap-3">
                {getFileIcon()}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    {getFileName()}
                  </p>
                  <p className={`text-xs truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
                    {displayFileType} • {formatFileSize(message.fileSize)}
                  </p>
                </div>
              </div>
              <a
                href={message.imageOrVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white"
              >
                <FaDownload className="h-3 w-3" />
                Download
              </a>

            </div>
            {message.content && (
              <p className={`mt-2 ml-2 ${isMobile ? "text-sm" : "text-base"} ${theme === 'dark' ? "text-gray-100" : "text-gray-900"}`} >
                {message.content}
              </p>
            )}
          </div>
        )

      default:
        return (
          <p className="text-base text-left leading-snug break-words whitespace-normal 
            [text-wrap:balance] md:[text-wrap:wrap]">
            {message.content}
          </p>
        )
    }
  }

  //! 🔴 Handle copy message
  const handleCopyMessage = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content)
        .then(() => {
          console.log("📋 Message copied to clipboard");
        })
        .catch(err => {
          console.error("❌ Failed to copy: ", err);
        });
    } else if (message.imageOrVideoUrl) {
      navigator.clipboard.writeText(message.imageOrVideoUrl)
        .then(() => {
          console.log("📋 Media URL copied");
        })
        .catch(err => {
          console.error("❌ Failed to copy URL: ", err);
        });
    }
    setShowOptions(false);
  }

  //! 🔴 Handle view media
  const handleViewMedia = () => {
    if (message.imageOrVideoUrl) {
      window.open(message.imageOrVideoUrl, '_blank')
    }
    setShowOptions(false)
  }

  //! 🔴 DELETE MESSAGE - WhatsApp Logic (FIXED FOR VIDEO)
  const handleDelete = () => {
    if (!deleteMessage || !message._id) return

    const isSender = isCurrentUser

    // WhatsApp Logic:
    // - Sender: Can delete for everyone OR delete for me
    // - Receiver: Can only delete for me
    if (isSender) {
      const choice = window.confirm(
        "Delete for everyone?\n\nClick OK for 'Delete for Everyone'\nClick Cancel for 'Delete for Me'"
      )

      if (choice) {
        // Delete for everyone
        deleteMessage(message._id, true)
      } else {
        // Delete for me only
        deleteMessage(message._id, false)
      }
    } else {
      // Receiver can only delete for me
      if (window.confirm("Delete for me?")) {
        deleteMessage(message._id, false)
      }
    }

    setShowOptions(false)

    // 🔴 IMMEDIATE UI UPDATE FOR VIDEO MESSAGES
    if (message.contentType === 'video' || message.contentType === 'image') {
      // Force re-render of messages
      setTimeout(() => {
        window.dispatchEvent(new Event('messageDeleted'))
      }, 100)
    }
  }

  //! 🔴 Handle emoji reaction
  const handleReact = (emoji) => {
    if (!onReact || !message._id) return
    onReact(message._id, emoji)
    setShowReactions(false)
    setOpenMenu(null)
  }

  //! 🔴 Close all popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showReactions && reactionsMenuRef.current && !reactionsMenuRef.current.contains(e.target)) {
        setShowReactions(false)
      }

      if (showOptions && optionsRef.current && !optionsRef.current.contains(e.target)) {
        setShowOptions(false)
      }

      if (openMenu === "emoji" && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setOpenMenu(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showReactions, showOptions, openMenu])

  //! 🔴 WHATSAPP-STYLE SMART EMOJI PICKER POSITIONING
  useLayoutEffect(() => {
    if (openMenu !== "emoji" || !messageRef.current) return

    const calculatePickerPosition = () => {
      const HEADER_HEIGHT = 60
      const FOOTER_HEIGHT = 70
      const PICKER_HEIGHT = 340
      const PICKER_WIDTH = 300
      const VIEWPORT_PADDING = 20

      const messageRect = messageRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Calculate available space
      const availableSpaceAbove = messageRect.top - HEADER_HEIGHT - VIEWPORT_PADDING
      const availableSpaceBelow = viewportHeight - messageRect.bottom - FOOTER_HEIGHT - VIEWPORT_PADDING

      // WhatsApp-style logic:
      // 1. If message is in top half of screen -> open downward
      // 2. If message is in bottom half of screen -> open upward
      // 3. Ensure picker doesn't go outside viewport

      const messageCenterY = messageRect.top + messageRect.height / 2
      const viewportCenterY = viewportHeight / 2

      let shouldOpenUpward = messageCenterY > viewportCenterY

      // Check if there's enough space in chosen direction
      if (shouldOpenUpward && availableSpaceAbove < PICKER_HEIGHT) {
        shouldOpenUpward = false
      } else if (!shouldOpenUpward && availableSpaceBelow < PICKER_HEIGHT) {
        shouldOpenUpward = true
      }

      // Calculate left position (center-aligned to message)
      let pickerLeft = messageRect.left + (messageRect.width / 2) - (PICKER_WIDTH / 2)

      // Ensure picker stays within viewport horizontally
      pickerLeft = Math.max(
        VIEWPORT_PADDING,
        Math.min(pickerLeft, viewportWidth - PICKER_WIDTH - VIEWPORT_PADDING)
      )

      // Calculate top/bottom position
      let pickerTop
      if (shouldOpenUpward) {
        pickerTop = messageRect.top - PICKER_HEIGHT - 10
      } else {
        pickerTop = messageRect.bottom + 10
      }

      // Ensure picker stays within viewport vertically
      if (shouldOpenUpward && pickerTop < HEADER_HEIGHT) {
        pickerTop = HEADER_HEIGHT
      } else if (!shouldOpenUpward && pickerTop + PICKER_HEIGHT > viewportHeight - FOOTER_HEIGHT) {
        pickerTop = viewportHeight - FOOTER_HEIGHT - PICKER_HEIGHT
      }

      setPickerPosition({ top: pickerTop, left: pickerLeft })
      setPickerDirection(shouldOpenUpward ? 'upward' : 'downward')

      // 🔴 AUTO-SCROLL TO MAKE PICKER VISIBLE
      const messagesContainer = document.querySelector('.messages-container')
      if (messagesContainer) {
        const containerRect = messagesContainer.getBoundingClientRect()
        const pickerBottom = pickerTop + PICKER_HEIGHT

        if (pickerTop < containerRect.top + 50) {
          // Picker is too high, scroll up
          const scrollAmount = (containerRect.top + 50) - pickerTop
          messagesContainer.scrollTop -= scrollAmount
        } else if (pickerBottom > containerRect.bottom - 50) {
          // Picker is too low, scroll down
          const scrollAmount = pickerBottom - (containerRect.bottom - 50)
          messagesContainer.scrollTop += scrollAmount
        }
      }
    }

    calculatePickerPosition()

    // Recalculate on window resize
    const handleResize = () => {
      if (openMenu === "emoji") {
        calculatePickerPosition()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [openMenu])

  //! Auto-close reaction timer
  useEffect(() => {
    if (showReactions) {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current)
      }
      reactionTimerRef.current = setTimeout(() => {
        setShowReactions(false)
      }, 3000)
    }

    return () => {
      if (reactionTimerRef.current) {
        clearTimeout(reactionTimerRef.current)
      }
    }
  }, [showReactions])

  //! Reset errors when message changes
  useEffect(() => {
    setVideoError(false)
    setImageError(false)
  }, [message.imageOrVideoUrl])

  //! Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (message.isOptimistic && message.media) {
        try {
          URL.revokeObjectURL(URL.createObjectURL(message.media))
        } catch (err) {
          console.log("Cleanup error:", err)
        }
      }
    }
  }, [message.isOptimistic, message.media])



  return (
    <div className={`chat ${bubbleClass}`}>
      <div
        ref={messageRef}
        className={`${bubbleContentClass} relative group overflow-visible`}
      >
        {/*//& Message content */}
        <div className="flex flex-col gap-1 max-w-full pr-1.5">
          {renderMessageContent()}

          {/* Show upload status */}
          {(message.isOptimistic || message.messageStatus === 'sending') && (
            <div className="mt-1 text-xs text-gray-500 flex items-center">
              <FaSpinner className="h-3 w-3 animate-spin mr-1" />
              Sending...
            </div>
          )}

          {/* Show failed status */}
          {message.messageStatus === 'failed' && (
            <div className="mt-1 text-xs text-red-500">
              Failed to send. Tap to retry.
            </div>
          )}
        </div>

        {/*//& Message time and status */}
        <div className="mt-1 flex justify-end items-center">
          <span className="text-[11px] opacity-60 mr-2">
            {message.createdAt ? format(new Date(message.createdAt), "HH:mm") : ""}
          </span>

          {isCurrentUser && (
            <span className="flex items-center gap-[2px] translate-y-[1px]">
              {message.messageStatus === "sent" && (
                <FaCheck size={11} className="text-gray-400" />
              )}
              {message.messageStatus === "delivered" && (
                <FaCheckDouble size={11} className="text-gray-400" />
              )}
              {message.messageStatus === "read" && (
                <FaCheckDouble size={11} className="text-[#53bdeb]" />
              )}
              {(!message.messageStatus || message.messageStatus === "pending" || message.messageStatus === "sending") && (
                <FaCheck size={11} className="text-gray-400 opacity-50" />
              )}
              {message.messageStatus === "failed" && (
                <span className="text-[10px] text-red-500">✗</span>
              )}
            </span>
          )}
        </div>

        {/*//& 🔴 3-Dots menu */}
        <div
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          ref={optionsRef}
        >
          <button
            onClick={() => setShowOptions(prev => !prev)}
            className={`p-1 rounded-full ${theme === "dark" ? "text-white hover:bg-gray-700" : "text-gray-800 hover:bg-gray-200"} cursor-pointer`}
          >
            <HiDotsVertical size={18} />
          </button>

          {/*//^  Options Dropdown - UPDATED: Sender message right side, Receiver message left side */}
          {showOptions && (
            <div className={`absolute ${isCurrentUser ? 'right-0' : '-left-20'} top-full mt-1 shadow-lg rounded-lg py-1 z-50 min-w-[175px]
              ${theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"}`}>

              {/* Copy Button */}
              <button
                className="px-4 py-2 text-sm text-gray-700 w-full text-left flex items-center cursor-pointer
                  dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={handleCopyMessage}
              >
                <FaCopy className="mr-2 h-3 w-3" /> Copy
              </button>

              {/* View Media Button */}
              {(message.contentType === 'image' || message.contentType === 'video') && message.imageOrVideoUrl && (
                <button
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 
                    w-full text-left flex items-center cursor-pointer"
                  onClick={handleViewMedia}
                >
                  <FaEye className="mr-2 h-3 w-3" /> View
                </button>
              )}

              {/* Delete Button */}
              <button
                className="px-4 py-2 text-sm text-red-600 hover:bg-gray-100
                   dark:hover:bg-gray-700 w-full text-left flex items-center cursor-pointer"
                onClick={handleDelete}
              >
                <FaTrash className="mr-2 h-3 w-3" />
                {isCurrentUser ? "Delete for Everyone" : "Delete for Me"}
              </button>
            </div>
          )}
        </div>

        {/*//^ Reactions (Smile Icon) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
            ${isCurrentUser ? "-left-10" : "-right-10"}`}
        >
          <div className="relative flex flex-col items-center">
            <button
              onClick={() => {
                setOpenMenu(null)
                if (reactionTimerRef.current) {
                  clearTimeout(reactionTimerRef.current)
                }
                setShowReactions(true)
              }}
              className={`p-2 rounded-full shadow-lg cursor-pointer
              ${theme === "dark"
                  ? "bg-[#202c33] hover:bg-[#202c33]/80"
                  : "bg-white hover:bg-gray-100"
                }`}
            >
              <FaSmile
                className={`${theme === 'dark' ? "text-gray-200" : "text-gray-600"} w-5 h-5`}
              />
            </button>

            {/* // &  After clicking smile icon, quick-reaction appears  */}
            {showReactions && (
              <div
                ref={reactionsMenuRef}
                className={`
                  //~ [1] Mobile vs Desktop positioning
                  ${isMobile
                    ? 'fixed bottom-10 left-1/2 transform px-1 py-1.5 gap-[1px]'
                    : 'absolute bottom-full mb-2 px-2.5 py-1.5 gap-1'
                  }
      
                    //~ [2] Desktop positioning based on sender/receiver
                  ${!isMobile && (isCurrentUser
                    ? '-right-20'  // For Sender: 
                    : '-left-20'   // For Receiver: 
                  )}
      
                  //~ [3] Mobile positioning based on sender/receiver
                  ${isMobile && (isCurrentUser
                    ? 'translate-x-[70px]'  //? For Sender: 
                    : '-translate-x-[65px]' //? For Receiver: 
                  )}
                  flex items-center bg-[#202c33]/95 z-[9999] rounded-full backdrop-blur-md border border-gray-600/30 cursor-pointer 
                  overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out whitespace-nowrap
                `}
                style={{
                  //^ For Mobile Devices
                  ...(isMobile && {
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 'fit-content',
                    maxWidth: '90vw',
                  })
                }}
              >
                {quickReactions.map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => handleReact(emoji)}
                    className={`hover:scale-110 active:scale-105 transition-transform duration-150
                      ${isMobile
                        ? 'p-2 text-[17px] w-7 h-7'  // Mobile: fixed size
                        : 'p-3 text-[18px] w-8 h-8' // Desktop: fixed size
                      }
                      flex-shrink-0 rounded-full hover:bg-white/10 flex items-center justify-center
                    `}
                  >
                    {emoji}
                  </button>
                ))}

                {/*//&  Divider  */}
                <div
                  className={`${isMobile ? 'w-[0.5px] h-4 mx-0.5' : 'w-[1px] h-5 mx-1'} bg-gray-600/50 flex-shrink-0
                `}
                />
                {/*//&  Plus button for full emoji picker  */}
                <button
                  className={`hover:bg-[#ffffff1a] rounded-full transition-colors duration-150
                    flex-shrink-0 flex items-center justify-center
                    ${isMobile
                      ? 'p-1 w-7 h-7'
                      : 'p-1.5 w-8 h-8'
                    }
                  `}
                  onClick={() => {
                    setShowReactions(false)
                    setOpenMenu("emoji")
                  }}
                >
                  <FaPlus className={`${isMobile ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-gray-300`} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/*//^ 🔴 WhatsApp-style "Emoji Picker" with Smart Positioning */}
        <AnimatePresence>
          {openMenu === "emoji" && (
            <>
              {/*//& Backdrop for click outside (optional) */}
              <motion.div
                className="fixed inset-0 z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.001 }} // Almost invisible, just for capturing clicks
                exit={{ opacity: 0 }}
                onClick={() => setOpenMenu(null)}
              />

              {/*//& Emoji Picker */}
              <motion.div
                ref={emojiPickerRef}
                className={`fixed z-50 w-[280px] h-[330px] sm:w-[310px] sm:h-[340px] rounded-2xl bg-gradient-to-br from-white/95 to-gray-100/95 backdrop-blur-2xl 
                  shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-gray-200/50 overflow-hidden
                  
                  //~ [1] Desktop positioning based on sender/receiver
                  ${!isMobile && (isCurrentUser
                    ? 'right-20'  // For Sender: 
                    : 'left-140'   // For Receiver: 
                  )}
                  //~ [2] Mobile positioning based on sender/receiver
                  ${isMobile && (isCurrentUser
                    ? 'right-8'  // For Sender: 
                    : 'left-5'   // For Receiver: 
                  )}
                  `}
                style={{
                  top: `${pickerPosition.top}px`,
                }}
                initial={{
                  opacity: 0,
                  y: pickerDirection === 'upward' ? 20 : -20,
                  scale: 0.95
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1
                }}
                exit={{
                  opacity: 0,
                  y: pickerDirection === 'upward' ? 20 : -20,
                  scale: 0.95
                }}
                transition={{
                  type: "spring",
                  damping: 25,
                  stiffness: 300,
                  mass: 0.8
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiPicker
                  width="100%"
                  height="100%"
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  onEmojiClick={(emojiObject) => {
                    handleReact(emojiObject.emoji)
                  }}
                  previewConfig={{
                    showPreview: false
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/*//^ 🔴 Show Reaction below Message-Bubble */}
        {message.reactions && message.reactions.length > 0 && (
          <div
            className={`absolute -bottom-5 flex items-center rounded-full shadow-md p-1 
              ${isCurrentUser ? "-right-0.5" : "-left-0.5"}
              ${theme === "dark" ? "bg-[#2a3942]" : "bg-gray-100"}`}
          >
            {Object.entries(
              message.reactions.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1
                return acc
              }, {})
            ).map(([emoji, count]) => (
              <span key={emoji} className="mr-0.5 last:mr-0 text-sm flex items-center gap-0.5">
                {emoji}
                {count > 1 && (
                  <span className={`${theme === 'dark' ? "bg-gray-600" : "bg-gray-200"} text-[11px] px-1 rounded-full`}>
                    {count}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble