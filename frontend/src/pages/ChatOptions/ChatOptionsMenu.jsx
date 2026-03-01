import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaEllipsisV, FaTimes, FaCheckCircle, FaImage, FaSignInAlt } from 'react-icons/fa'
import ClearChatModal from './ClearChatModal'
import WallpaperModal from './WallpaperModal'

const ChatOptionsMenu = ({ theme, onClearChat, onWallpaperChange}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)
  const [showWallpaperModal, setShowWallpaperModal] = useState(false)
  const menuRef = useRef(null)

  //^ Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleClear = async () => {
    setShowClearModal(false)
    setIsOpen(false)
    await onClearChat()
  }

  const handleWallpaperSelect = (type, value) => {
    onWallpaperChange(type, value)
    setShowWallpaperModal(false)
    setIsOpen(false)
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`group relative flex items-center justify-center h-10 w-10 rounded-full transition-all 
            duration-300 ease-out hover:scale-110 focus:outline-none cursor-pointer -right-2
            ${theme === 'dark' ? 'hover:bg-green-400/20' : 'hover:bg-green-50'}`}
        >
          <span className={`absolute inset-0 rounded-full blur-md transition duration-300
            ${theme === 'dark' ? 'bg-green-400 opacity-0 group-hover:opacity-40' : 'bg-green-500 opacity-0 group-hover:opacity-20'}`}
          />
          <FaEllipsisV className={`relative h-4 w-4 transition-colors duration-300
            ${theme === 'dark' ? 'text-green-600 group-hover:text-green-400' : 'text-green-500 group-hover:text-green-600'}`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`absolute right-4 sm:right-0 top-12 w-50 sm:w-55 rounded-xl shadow-xl overflow-hidden z-50 backdrop-blur-md
                ${theme === 'dark' ? 'bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700' : 'bg-gradient-to-b from-white to-gray-50 border border-gray-200'}`}
            >
              {/*//^ Clear Chat */}
              <button
                onClick={() => { setShowClearModal(true); setIsOpen(false); }}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer 
                    ${theme === 'dark' ? "hover:bg-gray-700 text-red-500" : "hover:bg-gray-200 text-red-600"}`}
              >
                <FaTimes className="text-red-500" />
                <span>Clear Chat</span>
              </button>

              {/*//^ Change Wallpaper */}
              <button
                onClick={() => { setShowWallpaperModal(true); setIsOpen(false); }}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer
                    ${theme === 'dark' ? "hover:bg-gray-700  text-gray-300" : "hover:bg-gray-200  text-gray-600"}`}
              >
                <FaImage className={`${theme === 'dark' ? "text-gray-300" : "text-gray-500"}`} />
                <span>Change Wallpaper</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/*//& Modals */}
      <ClearChatModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClear}
        theme={theme}
      />
      <WallpaperModal
        isOpen={showWallpaperModal}
        onClose={() => setShowWallpaperModal(false)}
        onSelect={handleWallpaperSelect}
        theme={theme}
      />
    </>
  )
}

export default ChatOptionsMenu