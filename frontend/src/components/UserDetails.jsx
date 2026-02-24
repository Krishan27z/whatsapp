import React, { useEffect, useRef, useState } from 'react'
import useUserStore from '../stores/useUserStore'
import useThemeStore from '../stores/useThemeStore'
import { updateUserProfile } from '../services/user.service'
import { toast } from 'react-toastify'
import { motion, AnimatePresence } from 'framer-motion'
import Layout from './Layout'
import { FaCamera, FaCheck, FaPencilAlt, FaSmile, FaSpinner, FaTimes } from 'react-icons/fa'
import { MdCancel } from 'react-icons/md'
import EmojiPicker from 'emoji-picker-react'
import { getSocket } from '../services/chat.service'

//& SEXY PROFILE IMAGE UPLOAD SPINNER COMPONENT
const ProfileImageSpinner = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    {/*//~ Main spinner container */}
    <div className="relative w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20">
      {/*//~ Outer glow effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400/20 via-cyan-400/20 to-blue-400/20 animate-pulse"></div>
      
      {/*//~ Rotating gradient rings */}
      <div className="absolute inset-0 border-[3px] border-transparent border-t-green-400 border-r-cyan-400 rounded-full animate-spin"></div>
      <div className="absolute inset-2 border-[2px] border-transparent border-b-blue-400 border-l-purple-400 rounded-full animate-spin-reverse" 
           style={{ animationDuration: '0.8s' }}></div>
      <div className="absolute inset-4 border-[2px] border-transparent border-t-pink-400 border-r-yellow-400 rounded-full animate-spin" 
           style={{ animationDuration: '1.2s' }}></div>
      
      {/*//~ Center dot with gradient */}
      <div className="absolute inset-6 bg-gradient-to-r from-green-400 to-cyan-400 rounded-full animate-pulse"></div>
      
      {/*//~ Camera icon inside spinner */}
      <div className="absolute inset-0 flex items-center justify-center">
        <FaCamera className="h-6 w-6 sm:h-7 sm:w-7 text-white animate-bounce" style={{ animationDuration: '2s' }} />
      </div>
    </div>
    
    {/*//~ Floating particles effect */}
    <div className="absolute -top-2 -left-2 w-3 h-3 sm:w-4 sm:h-4 bg-green-400/40 rounded-full animate-ping"></div>
    <div className="absolute -top-2 -right-2 w-2 h-2 sm:w-3 sm:h-3 bg-cyan-400/40 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
    <div className="absolute -bottom-2 -left-2 w-2 h-2 sm:w-3 sm:h-3 bg-blue-400/40 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
    <div className="absolute -bottom-2 -right-2 w-3 h-3 sm:w-4 sm:h-4 bg-purple-400/40 rounded-full animate-ping" style={{ animationDelay: '0.6s' }}></div>
  </div>
)

function UserDetails() {
  //& STATE VARIABLES
  const [name, setName] = useState("")
  const [about, setAbout] = useState("")
  const [profilePicture, setProfilePicture] = useState(null)
  const [preview, setPreview] = useState(null)

  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingAbout, setIsEditingAbout] = useState(false)
  const [showNameEmoji, setShowNameEmoji] = useState(false)
  const [showAboutEmoji, setShowAboutEmoji] = useState(false)
  const [loading, setLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)

  const emojiRef = useRef(null)

  //& STORE HOOKS
  const { user, setUser } = useUserStore()
  const { theme } = useThemeStore()

  //& INITIALIZE FORM WITH USER DATA
  useEffect(() => {
    if (user) {
      setName(user.username || "")
      setAbout(user.about || "")
    }
  }, [user])

  //& EMOJI PICKER CLOSE WHEN CLICKING OUTSIDE
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        emojiRef.current &&
        !emojiRef.current.contains(e.target)
      ) {
        setShowNameEmoji(false)
        setShowAboutEmoji(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  //& HANDLE PROFILE IMAGE CHANGE
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    //& Validate file size (max 10MB for profile pictures)
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_SIZE) {
      toast.error(`File too large! Maximum 10MB allowed. Your file: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      e.target.value = ''
      return
    }

    //& Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type! Please upload JPG, PNG, GIF or WebP image.')
      e.target.value = ''
      return
    }

    setProfilePicture(file)
    setPreview(URL.createObjectURL(file))
  }

  //& HANDLE SAVE PROFILE CHANGES
  const handleSave = async (field) => {
    try {
      //& Set loading state based on field
      if (field === 'profile') {
        setImageLoading(true)
        toast.info('📤 Starting upload...', {
          position: "top-center",
          autoClose: 1500,
          hideProgressBar: true,
        })
      } else {
        setLoading(true)
      }

      const formData = new FormData()

      if (field === 'name') {
        formData.append("username", name)
        setIsEditingName(false)
        setShowNameEmoji(false)
      }
      else if (field === 'about') {
        formData.append("about", about)
        setIsEditingAbout(false)
        setShowAboutEmoji(false)
      }

      if (profilePicture && field === 'profile') {
        formData.append("media", profilePicture)
      }

      //* 🔴 1. UPDATE PROFILE IN BACKEND
      const response = await updateUserProfile(formData)
      const updated = response?.data || response

      if (!updated) {
        throw new Error("No response from server")
      }

      console.log("✅ Profile updated:", {
        id: updated._id,
        username: updated.username,
        profilePicture: updated.profilePicture
      })

      //* 🔴 2. UPDATE LOCAL USER STORE IMMEDIATELY
      setUser(updated)
      setProfilePicture(null)
      setPreview(null)

      //* 🔴 3. EMIT SOCKET EVENT TO NOTIFY ALL CONTACTS
      const socket = getSocket()
      if (socket && updated) {
        console.log("📡 Emitting socket event: user_profile_updated")
        socket.emit("user_profile_updated", {
          _id: updated._id,
          username: updated.username,
          profilePicture: updated.profilePicture,
          about: updated.about,
          isOnline: true,
          lastSeen: new Date()
        })
      } else {
        console.error("❌ Socket not available")
      }

      //* 🔴 4. DIFFERENT TOAST MESSAGES WITH EMOJIS
      if (field === 'name') {
        toast.success('Name updated successfully!', {
          icon: '👤',
          position: "top-right",
          autoClose: 2000,
        })
      }
      if (field === 'about') {
        toast.success('About updated successfully!', {
          icon: '✏️',
          position: "top-right",
          autoClose: 2000,
        })
      }
      if (field === 'profile') {
        toast.success('Profile picture updated successfully!', {
          icon: '✅',
          position: "top-center",
          autoClose: 2500,
          className: 'bg-gradient-to-r from-green-500 to-cyan-500 text-white',
        })
      }

    } catch (error) {
      console.error("❌ Update error:", error)
      
      if (field === 'profile') {
        toast.error('❌ Failed to upload profile picture. Please try again.', {
          position: "top-center",
          autoClose: 3000,
        })
      } else {
        toast.error(`❌ Failed to update ${field}`)
      }
      
    } finally {
      //& Reset loading states
      setLoading(false)
      setImageLoading(false)
    }
  }

  //& HANDLE EMOJI SELECTION
  const handleEmojiSelect = (emoji, field) => {
    if (field === 'name') {
      setName((prev) => prev + emoji.emoji)
      setShowNameEmoji(false)
    }
    else {
      setAbout((prev) => prev + emoji.emoji)
      setShowAboutEmoji(false)
    }
  }



  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`w-full min-h-screen flex border-r
          ${theme === 'dark'
            ? "bg-[rgb(17,27,33)] border-gray-600 text-white"
            : "bg-gray-100 border-gray-200 text-black"}
        `}
      >
        <div className='w-full max-w-4xl mx-auto px-4 sm:px-3 py-6 sm:py-8'>
          {/*//& HEADER */}
          <div className='flex items-center mb-4 sm:mb-6'>
            <h1 className='text-2xl sm:text-3xl font-bold'>Profile</h1>
          </div>

          <div className='space-y-6 sm:space-y-8'>
            {/*//& PROFILE IMAGE SECTION */}
            <div className='flex flex-col items-center'>
              <div className='relative group w-36 h-36 sm:w-44 sm:h-44'>
                {/*//~ Profile Image Container */}
                <div className="relative w-full h-full rounded-full overflow-hidden border-4 border-gray-300 dark:border-gray-700 shadow-xl">
                  {/*//* Main Profile Image */}
                  <img
                    src={preview || user?.profilePicture}
                    alt='profile picture'
                    className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${user?.username || 'User'}&background=random&color=fff&size=512`
                    }}
                  />
                  
                  {/*//~ Uploading Overlay with Spinner */}
                  {imageLoading && profilePicture && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center rounded-full"
                    >
                      <div className="relative">
                        <ProfileImageSpinner />
                        {/*//~ Progress Text */}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute -bottom-12 sm:-bottom-14 left-1/2 transform -translate-x-1/2 whitespace-nowrap"
                        >
                          <p className="text-white text-sm sm:text-base font-medium bg-black/60 px-4 py-2 rounded-full">
                            Uploading...
                          </p>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/*//~ Change Profile Button (Only show when not uploading) */}
                {!imageLoading && (
                  <label
                    htmlFor='profileUpload'
                    className={`absolute inset-0 bg-black/60 rounded-full flex items-center justify-center
                      opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer
                      ${preview ? 'opacity-100' : 'group-hover:opacity-100'}`}
                  >
                    <div className='text-center text-white'>
                      <FaCamera className='h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 animate-bounce' />
                      <span className='text-sm sm:text-base font-medium'>{preview ? 'Preview' : 'Change'}</span>
                    </div>
                    <input
                      type='file'
                      id='profileUpload'
                      accept='image/*'
                      onChange={handleImageChange}
                      className='hidden'
                      disabled={imageLoading}
                    />
                  </label>
                )}
              </div>
              
              {/*//& Image Info (When preview is shown) */}
              {preview && profilePicture && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 sm:mt-1 text-center"
                >
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">
                    Selected: {profilePicture.name.slice(0, 20)}{profilePicture.name.length > 20 ? '...' : ''}
                  </p>
                  {profilePicture && (
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Size: {(profilePicture.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  )}
                </motion.div>
              )}
            </div>

            {/*//& ACTION BUTTONS FOR PROFILE PICTURE */}
            {preview && (
              <div className='flex flex-col sm:flex-row justify-center gap-3 sm:gap-5 mt-1 px-4'>
                {/*//~ Change/Upload Button with Loading State */}
                <motion.button
                  onClick={() => handleSave('profile')}
                  disabled={imageLoading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`relative px-6 py-3 sm:px-8 sm:py-1 rounded-xl font-medium transition-all duration-300
                    ${imageLoading 
                      ? 'bg-gradient-to-r from-green-600/50 to-cyan-600/50 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 shadow-lg hover:shadow-xl'
                    } text-white w-full sm:w-auto`}
                >
                  {imageLoading ? (
                    <div className="flex items-center justify-center space-x-3">
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm sm:text-base">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-3">
                      <FaCamera className="h-6 w-6" />
                      <span className="text-sm sm:text-base">Upload & Save</span>
                    </div>
                  )}
                </motion.button>
                
                {/*//~ Discard Button */}
                <motion.button
                  onClick={() => {
                    setProfilePicture(null)
                    setPreview(null)
                  }}
                  disabled={imageLoading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`px-6 py-3 sm:px-8 sm:py-1 rounded-xl font-medium transition-all duration-300
                    ${imageLoading 
                      ? 'bg-red-500/50 cursor-not-allowed' 
                      : 'bg-red-500 hover:bg-red-600 shadow-lg hover:shadow-xl'
                    } text-white w-full sm:w-auto`}
                >
                  <div className="flex items-center justify-center space-x-3">
                    <FaTimes className="h-5 w-5" />
                    <span className="text-sm sm:text-base">Discard</span>
                  </div>
                </motion.button>
              </div>
            )}

            {/*//& NAME SECTION - EDIT WITH EMOJI / DISCARD */}
            <div className={`relative p-2 sm:px-4 sm:py-1 shadow-lg rounded-xl ${theme === 'dark' ? "bg-gray-800" : "bg-white"}`}>
              <label
                htmlFor='name'
                className='block text-sm sm:text-base font-medium mb-1 sm:mb-2 text-gray-400 text-start'
              >
                Your Name
              </label>
              <div className='flex items-center space-x-2 sm:space-x-1'>
                {isEditingName ? (
                  <input
                    id='name'
                    type='text'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base
                      ${theme === 'dark' ? "bg-gray-700 text-white" : "bg-white text-black"}
                    `}
                    placeholder="Enter your name"
                    autoFocus
                  />
                ) : (
                  <span className='w-full px-1 py-2.5 text-sm sm:text-base break-words'>
                    {user?.username || name || 'No name set'}
                  </span>
                )}

                <div className="flex items-center space-x-1">
                  {isEditingName ? (
                    <>
                      <motion.button
                        onClick={() => handleSave('name')}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        disabled={loading}
                      >
                        {loading ? (
                          <FaSpinner className='h-4 w-4 sm:h-5 sm:w-5 text-green-500 animate-spin' />
                        ) : (
                          <FaCheck className='h-5 w-5 text-green-500' />
                        )}
                      </motion.button>

                      <motion.button
                        onClick={() => setShowNameEmoji(!showNameEmoji)}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <FaSmile className='h-5 w-5 text-yellow-500' />
                      </motion.button>

                      <motion.button
                        onClick={() => {
                          setIsEditingName(false)
                          setShowNameEmoji(false)
                        }}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <MdCancel className='h-5 w-5 text-gray-500' />
                      </motion.button>
                    </>
                  ) : (
                    <motion.button
                      onClick={() => setIsEditingName(!isEditingName)}
                      className={`p-2 sm:p-2.5 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-green-200"}`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <FaPencilAlt className='h-4 w-4 sm:h-5 sm:w-5 text-gray-500' />
                    </motion.button>
                  )}
                </div>
              </div>

              {/*//& OPEN THE EMOJI PICKER */}
              <AnimatePresence>
                {showNameEmoji && (
                  <motion.div
                    ref={emojiRef}
                    className='absolute z-50 -top-80 scale-75 sm:scale-80 origin-bottom right-0'
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25 }}
                  >
                    <EmojiPicker
                      width={300}
                      height={380}
                      onEmojiClick={(emoji) => handleEmojiSelect(emoji, "name")}
                      theme={theme === 'dark' ? 'dark' : 'light'}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/*//& ABOUT SECTION - EDIT WITH EMOJI / DISCARD */}
            <div className={`relative p-2 sm:px-4 sm:py-1 shadow-lg rounded-xl ${theme === 'dark' ? "bg-gray-800" : "bg-white"}`}>
              <label
                htmlFor='about'
                className='block text-sm sm:text-base font-medium mb-1 sm:mb-2 text-gray-400 text-start'
              >
                About
              </label>
              <div className='flex items-center space-x-2 sm:space-x-1'>
                {isEditingAbout ? (
                  <input
                    id='about'
                    type='text'
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    className={`w-full px-3 sm:px-2 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base
                      ${theme === 'dark' ? "bg-gray-700 text-white" : "bg-white text-black"}
                    `}
                    placeholder="Hey there! I am using WhatsApp"
                    autoFocus
                  />
                ) : (
                  <span className='w-full px-1 py-2.5 text-sm sm:text-base break-words'>
                    {user?.about || about || 'Hey there! I am using WhatsApp'}
                  </span>
                )}

                <div className="flex items-center space-x-1">
                  {isEditingAbout ? (
                    <>
                      <motion.button
                        onClick={() => handleSave('about')}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        disabled={loading}
                      >
                        {loading ? (
                          <FaSpinner className='h-4 w-4 sm:h-5 sm:w-5 text-green-500 animate-spin' />
                        ) : (
                          <FaCheck className='h-5 w-5 text-green-500' />
                        )}
                      </motion.button>

                      <motion.button
                        onClick={() => setShowAboutEmoji(!showAboutEmoji)}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <FaSmile className='h-5 w-5 text-yellow-500' />
                      </motion.button>

                      <motion.button
                        onClick={() => {
                          setIsEditingAbout(false)
                          setShowAboutEmoji(false)
                        }}
                        className={`p-2 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <MdCancel className='h-5 w-5 text-gray-500' />
                      </motion.button>
                    </>
                  ) : (
                    <motion.button
                      onClick={() => setIsEditingAbout(!isEditingAbout)}
                      className={`p-2 sm:p-2.5 focus:outline-none rounded-full cursor-pointer ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-green-200"}`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <FaPencilAlt className='h-4 w-4 sm:h-5 sm:w-5 text-gray-500' />
                    </motion.button>
                  )}
                </div>
              </div>

              {/*//& OPEN THE EMOJI PICKER */}
              <AnimatePresence>
                {showAboutEmoji && (
                  <motion.div
                    ref={emojiRef}
                    className='absolute z-50 -top-80 scale-75 sm:scale-80 origin-bottom right-0'
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ type: "spring", damping: 25 }}
                  >
                    <EmojiPicker
                      width={300}
                      height={380}
                      onEmojiClick={(emoji) => handleEmojiSelect(emoji, "about")}
                      theme={theme === 'dark' ? 'dark' : 'light'}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </Layout>
  )
}

export default UserDetails