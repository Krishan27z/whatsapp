import React, { useEffect, useRef, useState, useCallback } from 'react'
import useThemeStore from '../../stores/useThemeStore'
import useUserStore from '../../stores/useUserStore'
import useStatusStore from '../../stores/useStatusStore'
import Layout from '../../components/Layout'
import StatusPreview from './StatusPreview'
import { FaCamera, FaEllipsisH, FaPlus } from 'react-icons/fa'
import formatTimestamp from '../../utils/formatTime'
import StatusList from './StatusList'
import { getSocket } from '../../services/chat.service'
import heic2any from 'heic2any'
import EmojiPicker from 'emoji-picker-react'
import { FaSmile } from 'react-icons/fa'
import { AnimatePresence, motion } from 'framer-motion'

function Status() {
  //! ========== COMPONENT STATE ==========
  const [previewContact, setPreviewContact] = useState(null)        // currently opened status user
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0)   // which status of that user
  const [showOption, setShowOption] = useState(false)                // my status options menu
  const [selectedFile, setSelectedFile] = useState(null)             // file picked for new status
  const [openMenu, setOpenMenu] = useState(null)                     // which menu is open (emoji, etc)
  const [showCreateModal, setShowCreateModal] = useState(false)      // create status modal visibility
  const [newStatus, setNewStatus] = useState("")                     // text input for status
  const [filePreview, setFilePreview] = useState(null)               // preview URL of selected media
  const [convertedHEICFile, setConvertedHEICFile] = useState(null)   // HEIC converted to jpeg
  const [fileType, setFileType] = useState(null)                     // 'image' or 'video'
  const emojiButtonRef = useRef(null)
  const emojiPickerRef = useRef(null)

  //! ========== DOM REFS ==========
  const inputRef = useRef(null)
  const filePreviewCleanupRef = useRef(null)    // cleanup function for object URLs
  const fileInputRef = useRef(null)

  //! ========== ZUSTAND STORES ==========
  const { theme } = useThemeStore()
  const { user } = useUserStore()

  //! ========== STATUS STORE ACTIONS & SELECTORS ==========
  const { statuses, loading, initializeSocket, cleanupSocket, fetchStatuses, createStatus, viewStatus,
    deleteStatus, getUserStatuses, getOtherStatuses, clearError } = useStatusStore()

  // derived data: my statuses & others' statuses
  const userStatuses = getUserStatuses(user?._id)
  const otherStatuses = getOtherStatuses(user?._id)
  const socket = getSocket()

  //^ ========== INITIAL FETCH & SOCKET SETUP ==========
  useEffect(() => {
    fetchStatuses()                 // load all statuses from API
    initializeSocket()              // set up socket listeners for real‑time updates

    // 🔴 REAL-TIME STATUS UPDATES – handlers refresh the list when events arrive
    const handleNewStatus = (newStatus) => {
      console.log("🎯 New status in real-time")
      fetchStatuses()
    }

    const handleStatusDeleted = ({ statusId }) => {
      console.log("🗑️ Status deleted in real-time")
      fetchStatuses()
    }

    if (socket) {
      socket.on("new_status", handleNewStatus)
      socket.on("status_deleted", handleStatusDeleted)
      socket.on("status_global_update", handleNewStatus)   // fallback catch‑all
    }

    return () => {
      cleanupSocket()               // remove socket listeners on unmount
      if (socket) {
        socket.off("new_status", handleNewStatus)
        socket.off("status_deleted", handleStatusDeleted)
        socket.off("status_global_update", handleNewStatus)
      }
    }
  }, [user?._id])

  //^ clear error on unmount
  useEffect(() => {
    return () => clearError()
  }, [])

  //^ ========== CLICK OUTSIDE HANDLER FOR EMOJI PICKER ==========
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenu === "emoji") {
        const isClickOnEmojiButton = emojiButtonRef.current &&
          (emojiButtonRef.current === e.target || emojiButtonRef.current.contains(e.target))
        const isClickInsideEmojiPicker = emojiPickerRef.current &&
          (emojiPickerRef.current === e.target || emojiPickerRef.current.contains(e.target))
        if (!isClickOnEmojiButton && !isClickInsideEmojiPicker) {
          setOpenMenu(null)
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openMenu])

  //* ========== BUILD VIEWERS MAP (GUARANTEED USER OBJECTS) ==========
  // This effect runs whenever statuses change. It processes viewers, reactions, etc.
  // and builds a map (statusViewersMap) where each entry is an array of
  // { user: { _id, username, profilePicture }, viewedAt } – always full objects.
  useEffect(() => {
    if (!statuses || statuses.length === 0) return;

    useStatusStore.setState((state) => {
      const nextMap = new Map(state.statusViewersMap); // start with existing map

      statuses.forEach(status => {
        const sId = status._id?.toString();
        if (!sId) return;

        // Get existing viewers for this status (if any)
        const existing = nextMap.get(sId) || [];

        // Build a Map keyed by user ID for easy merging
        const viewerMap = new Map();

        // 1. First, add all existing viewers (preserve what we already know)
        existing.forEach(entry => {
          if (entry?.user?._id) {
            viewerMap.set(entry.user._id.toString(), entry);
          } else if (entry?._id) {
            // legacy: entry is user object directly
            viewerMap.set(entry._id.toString(), { user: entry, viewedAt: entry.viewedAt });
          } else if (typeof entry === 'string') {
            // legacy string ID
            viewerMap.set(entry, {
              user: {
                _id: entry,
                username: 'User',
                profilePicture: `https://ui-avatars.com/api/?name=User&background=random`
              },
              viewedAt: new Date().toISOString()
            });
          }
        });

        // Helper to add a viewer – updates if already exists
        const addViewer = (userId, viewedAt, userObj = null) => {
          if (!userId) return;
          const userIdStr = userId.toString();

          // Create a guaranteed user object
          let userToStore;
          if (userObj && typeof userObj === 'object' && userObj._id) {
            userToStore = {
              _id: userObj._id.toString(),
              username: userObj.username || 'User',
              profilePicture: userObj.profilePicture || `https://ui-avatars.com/api/?name=${userObj.username || 'User'}&background=random`
            };
          } else {
            userToStore = {
              _id: userIdStr,
              username: 'User',
              profilePicture: `https://ui-avatars.com/api/?name=User&background=random`
            };
          }

          const existingEntry = viewerMap.get(userIdStr);
          if (!existingEntry) {
            // New viewer
            viewerMap.set(userIdStr, { user: userToStore, viewedAt });
          } else {
            // If existing entry has fallback and new one has real name, upgrade
            if (existingEntry.user.username === 'User' && userToStore.username !== 'User') {
              viewerMap.set(userIdStr, { user: userToStore, viewedAt: existingEntry.viewedAt });
            }
            // Otherwise keep existing (already has real name)
          }
        };

        // 2. Process viewers array (view records from DB)
        (status.viewers || []).forEach(viewRecord => {
          if (typeof viewRecord === 'object' && viewRecord !== null) {
            let userId = null;
            let viewedAt = viewRecord.viewedAt || new Date().toISOString();
            let userObj = null;

            if (viewRecord.user && typeof viewRecord.user === 'object' && viewRecord.user._id) {
              userId = viewRecord.user._id;
              userObj = viewRecord.user;
            } else if (viewRecord.user) {
              userId = viewRecord.user; // string ID
            }

            if (userId) {
              addViewer(userId, viewedAt, userObj);
            }
          } else if (viewRecord) {
            // viewRecord is just a user ID string
            addViewer(viewRecord, new Date().toISOString());
          }
        });

        // 3. Process reactions array – these users also "viewed"
        (status.reactions || []).forEach(reaction => {
          if (reaction.user && typeof reaction.user === 'object' && reaction.user._id) {
            addViewer(reaction.user._id, reaction.createdAt || new Date().toISOString(), reaction.user);
          } else if (reaction.user) {
            addViewer(reaction.user, reaction.createdAt || new Date().toISOString());
          }
        });

        // 4. Process viewersWithReactions
        (status.viewersWithReactions || []).forEach(reactor => {
          if (reactor.user && typeof reactor.user === 'object' && reactor.user._id) {
            addViewer(reactor.user._id, reactor.viewedAt || new Date().toISOString(), reactor.user);
          } else if (reactor.user) {
            addViewer(reactor.user, reactor.viewedAt || new Date().toISOString());
          }
        });

        // Convert map back to array and store
        nextMap.set(sId, Array.from(viewerMap.values()));
      });

      return { statusViewersMap: nextMap };
    });
  }, [statuses]);

  //~ ========== FILE HANDLING (with HEIC conversion) ==========
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const MAX_SIZE = 500 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      alert(`File too large! Maximum 500MB allowed. Your file: ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
      e.target.value = ''
      return
    }

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
        } else if (file.type.startsWith('video/')) {
          setFileType('video')
          const previewUrl = URL.createObjectURL(file)
          setFilePreview(previewUrl)
          filePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl)
        } else {
          alert("Please select only images or videos for status")
          e.target.value = ''
          return
        }

        setSelectedFile(file)
        setConvertedHEICFile(null)
      }

      setOpenMenu(null)
      e.target.value = ''
      setTimeout(() => inputRef.current?.focus(), 50)

    } catch (error) {
      console.error("❌ File conversion error:", error)
      alert("Failed to process file. Please try another file.")
      e.target.value = ''
    }
  }

  //& ========== CREATE STATUS (TEXT OR MEDIA) ==========
  const handleCreateStatus = async () => {
    if (!newStatus.trim() && !selectedFile) {
      alert("Please add text or media to create status")
      return
    }

    try {
      await createStatus({
        content: newStatus,          // for text status
        caption: newStatus,           // for image/video caption
        file: convertedHEICFile || selectedFile
      })

      setNewStatus("")
      setSelectedFile(null)
      setConvertedHEICFile(null)
      setFilePreview(null)
      setFileType(null)
      setShowCreateModal(false)
      fetchStatuses()  // refresh list

    } catch (error) {
      console.log("Error creating status:", error)
      alert("Failed to create status. Please try again.")
    }
  }

  //^ ========== HELPER FOR RING SEGMENTS (OWN STATUS) ==========
  const calculateRingSegments = (statusCount) => {
    if (!statusCount || statusCount === 0) return null

    const segments = []
    const circumference = 2 * Math.PI * 48 // Radius 48 for w-14 h-14
    const segmentLength = circumference / statusCount
    const gap = 1 // Small gap between segments

    for (let i = 0; i < statusCount; i++) {
      const offset = i * segmentLength
      segments.push({
        strokeDasharray: `${segmentLength - gap} ${gap}`,
        strokeDashoffset: -offset
      })
    }

    return segments
  }

  const userStatusSegments = calculateRingSegments(userStatuses?.statuses?.length)
  const currentStatus = userStatuses?.statuses?.[0]

  //* ========== PREVIEW LOGIC – START FROM FIRST UNSEEN ==========
  const handlePreview = useCallback((contact) => {
    if (!contact || !contact.statuses.length) return;

    const currentViewersMap = useStatusStore.getState().statusViewersMap;
    const myId = user?._id?.toString();

    let firstUnseenIndex = contact.statuses.findIndex(status => {
      const sId = status._id?.toString();
      const viewers = currentViewersMap.get(sId) || status.viewers || [];
      // viewers is now array of { user, viewedAt }
      const hasViewed = viewers.some(v => v.user?._id?.toString() === myId);
      return !hasViewed;
    });

    const finalIndex = firstUnseenIndex === -1 ? 0 : firstUnseenIndex;

    setPreviewContact(contact);
    setCurrentStatusIndex(finalIndex);

  }, [user?._id])

  //! ========== RENDER ==========
  return (
    <Layout
      isStatusPreviewOpen={!!previewContact}
      statusPreviewContent={
        previewContact && (
          <StatusPreview
            contact={previewContact}
            currentIndex={currentStatusIndex}
            onClose={() => {
              setPreviewContact(null)
              setCurrentStatusIndex(0)
            }}
            onNext={() => {
              if (currentStatusIndex < previewContact.statuses.length - 1) {
                const nextIndex = currentStatusIndex + 1;
                setCurrentStatusIndex(nextIndex);
                // Mark next as viewed if it's not our own status
                if (previewContact.id !== user?._id) {
                  viewStatus(previewContact.statuses[nextIndex]._id);
                }
              } else {
                setPreviewContact(null)
                setCurrentStatusIndex(0)
              }
            }}
            onPrev={() => {
              setCurrentStatusIndex(prev => Math.max(prev - 1, 0))
            }}
            onDelete={deleteStatus}
            theme={theme}
            currentUser={user}
            loading={loading}
          />
        )
      }
    >
      {/* //! LEFT PANEL – STATUS LIST SIDEBAR */}
      <div className={`w-full md:w-[360px] max-w-full md:max-w-[360px] min-w-0 md:min-w-[360px] h-screen 
            flex flex-col relative border-r
            ${theme === 'dark'
          ? "border-gray-600 bg-[rgb(17,27,33)]"
          : "border-gray-200 bg-white"}`}
      >
        <div className={`flex-1 flex flex-col ${theme === 'dark' ? "border-gray-600" : "border-gray-200"}`}>
          {/* //^ HEADER (fixed) */}
          <div className={`fixed top-0 z-50 w-full md:w-[360px] border-r
                ${theme === 'dark'
              ? "border-gray-600 bg-[rgb(17,27,33)]"
              : "border-gray-200 bg-white"}`}
          >
            <div className={`p-4 flex justify-between items-center 
                ${theme === 'dark' ? "text-white" : "text-gray-800"}`}
            >
              <h2 className="text-xl font-semibold">Status</h2>
            </div>
          </div>

          {/* //& SCROLLABLE CONTENT */}
          <div className='flex-1 overflow-y-auto no-scrollbar pt-[65px]'>
            {/* //^ MY STATUS SECTION */}
            <div
              onClick={() => {
                if (userStatuses) {
                  setPreviewContact(userStatuses);
                } else {
                  setShowCreateModal(true);
                }
              }}
              className={`flex space-x-4 shadow-md p-2 cursor-pointer
                  ${theme === 'dark' ? "bg-[rgb(17,27,33)]" : "bg-white"
                }`}
            >
              <div
                onClick={() => userStatuses ? setPreviewContact(userStatuses) : setShowCreateModal(true)}
                className='relative cursor-pointer'
              >
                <div className="relative w-14 h-14">
                  <img
                    src={user?.profilePicture}
                    alt={user?.username}
                    className='w-full h-full rounded-full object-cover'
                    onError={(e) => {
                      e.target.src = `https://ui-avatars.com/api/?name=${user?.username}&background=random`;
                    }}
                  />

                  {/* //^ MY STATUS RING – dynamic segments */}
                  {userStatuses && userStatuses.statuses && userStatuses?.statuses?.length > 0 && (
                    <svg
                      className='absolute top-0 left-0 w-full h-full rotate-90'
                      viewBox='0 0 100 100'
                    >
                      {userStatuses.statuses.map((_, index) => {
                        const count = userStatuses.statuses.length;
                        const radius = 48;
                        const circumference = 2 * Math.PI * radius;
                        const segmentLength = circumference / count;
                        const gap = count > 1 ? 8 : 0;
                        const dashArray = `${segmentLength - gap} ${gap}`;
                        const offset = index * segmentLength;

                        return (
                          <circle
                            key={index}
                            cx='50'
                            cy='50'
                            r={radius}
                            fill='none'
                            stroke='#25D366'
                            strokeWidth='4'
                            strokeDasharray={dashArray}
                            strokeDashoffset={-offset}
                            strokeLinecap="round" // Optional: edge gulo sundor korar jonno
                          />
                        );
                      })}
                    </svg>
                  )}

                  {/* //^ ADD STATUS BUTTON */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCreateModal(true)
                    }}
                    className='absolute bottom-0 right-0 bg-green-500 text-white p-1.5 rounded-full border-2 border-white cursor-pointer'
                  >
                    <FaPlus className='h-3.5 w-3.5' />
                  </button>
                </div>
              </div>

              <div className='flex flex-col items-start flex-1'>
                <p className='font-semibold'>
                  My Status
                </p>
                <p className={`text-sm pt-1 ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}>
                  {userStatuses && currentStatus
                    ? `${userStatuses.statuses.length} status${userStatuses.statuses.length > 1 ? 'es' : ''} • ${formatTimestamp(currentStatus.timeStamp)}`
                    : "Tap to add status update"
                  }
                </p>
              </div>

              {userStatuses && (
                <button
                  className='ml-auto'
                  onClick={(e) => {
                    e.stopPropagation();            // ⭐ prevents row click
                    setShowOption(!showOption);
                  }}
                >
                  <FaEllipsisH
                    className={`h-5 w-5 cursor-pointer ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}
                  />
                </button>
              )}
            </div>

            {/* //^ MY STATUS OPTIONS MENU */}
            {showOption && userStatuses && (
              <div className={`shadow-md p-1 ${theme === 'dark' ? "bg-[rgb(17,27,33)]" : "bg-white"}`}>
                <button
                  onClick={() => {
                    setShowCreateModal(true)
                    setShowOption(false)
                  }}
                  className="w-full text-left p-2 text-green-500 hover:bg-gray-100 rounded flex items-center"
                >
                  <FaCamera className='inline-block mr-2' />Add Status
                </button>
              </div>
            )}

            {/* //& LOADING INDICATOR */}
            {loading && (
              <div className='flex justify-center items-center p-8'>
                <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
              </div>
            )}

            {/* //& RECENT UPDATES (OTHER USERS' STATUSES) */}
            {!loading && otherStatuses.length > 0 && (
              <div className={`shadow-md p-4 mt-4 space-y-4 
                  ${theme === 'dark' ? "bg-[rgb(17,27,33)]" : "bg-white"}`}
              >
                <h3 className={`font-semibold ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}>
                  Recent Updates
                </h3>

                {otherStatuses.map((contact, index) => (
                  <React.Fragment key={contact?.id}>
                    <StatusList
                      contact={contact}
                      user={user}
                      onPreview={() => handlePreview(contact)}
                      theme={theme}
                    />
                    {index < otherStatuses.length - 1 && (
                      <hr className={`${theme === 'dark' ? "border-gray-700" : "border-gray-200"}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* //& EMPTY STATE – NO STATUSES AT ALL */}
            {!loading && statuses.length === 0 && (
              <div className='flex flex-col items-center justify-center p-8 text-center'>
                <div className={`text-6xl mb-4 ${theme === 'dark' ? "text-gray-600" : "text-gray-300"}`}>
                  📱
                </div>
                <h3 className={`text-lg mb-2 ${theme === 'dark' ? "text-gray-400" : "text-gray-600"}`}>
                  No Status Updated Yet
                </h3>
                <p className={`text-sm ${theme === 'dark' ? "text-gray-500" : "text-gray-600"}`}>
                  Be the first to share a status update
                </p>
              </div>
            )}
          </div>

          {/* //~ CREATE STATUS MODAL */}
          {showCreateModal && (
            <div className='fixed inset-0 flex items-center justify-center z-50' style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
              <div className={`relative p-6 rounded-lg max-w-md w-full mx-4 
                ${theme === 'dark' ? "bg-gray-800" : "bg-white"}`}
              >
                {/* spinner overlay while uploading */}
                {loading && (
                  <div className='absolute inset-0 rounded-lg flex items-center justify-center z-10' style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
                    <div className='animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent'></div>
                  </div>
                )}

                <h3 className={`text-lg mb-2 font-semibold ${theme === 'dark' ? "text-white" : "text-black"}`}>
                  Create Status
                </h3>

                {/* media preview */}
                {filePreview && (
                  <div className="relative w-full mb-4">
                    {fileType === 'image' ? (
                      <img
                        src={filePreview}
                        alt='preview'
                        className='w-full h-48 object-cover rounded-xl'
                      />
                    ) : fileType === 'video' ? (
                      <video
                        src={filePreview}
                        controls
                        className='w-full h-48 object-cover rounded-xl'
                      />
                    ) : null}
                  </div>
                )}
                {/* caption preview for media */}
                {filePreview && (
                  <div className={`mb-4 p-3 rounded-lg ${theme === 'dark'
                    ? newStatus ? 'bg-gray-700 text-white' : 'bg-gray-800/50 text-gray-400'
                    : newStatus ? 'bg-gray-100 text-black' : 'bg-gray-50 text-gray-500'
                    }`}>
                    {newStatus ? (
                      <p className="break-words whitespace-pre-wrap text-sm sm:text-base">
                        {newStatus}
                      </p>
                    ) : (
                      <p className="text-base italic opacity-80">Add a caption...</p>
                    )}
                  </div>
                )}

                {/* text input + emoji picker */}
                <div className="relative mb-4">
                  <textarea
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    placeholder="What's on your mind?"
                    className={`w-full p-3 pr-12 border rounded-lg resize-none transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-green-400  
                      ${theme === 'dark'
                        ? "text-white bg-gray-700 border-gray-600 placeholder-gray-300"
                        : "text-black bg-white border-gray-200 placeholder-gray-600"
                      }`}
                    rows={3}
                    disabled={loading}
                  />
                  <button
                    ref={emojiButtonRef}
                    onClick={() => setOpenMenu(openMenu === "emoji" ? null : "emoji")}
                    className={`absolute right-2 bottom-2 p-2 rounded-full transition-colors 
                      ${theme === 'dark'
                        ? "hover:bg-amber-400/30"
                        : "hover:bg-amber-100"
                      }`}
                    disabled={loading}
                  >
                    <FaSmile className={`h-6 w-6 ${theme === 'dark' ? 'text-amber-300' : 'text-amber-400'}`} />
                  </button>

                  <AnimatePresence>
                    {openMenu === "emoji" && (
                      <motion.div
                        ref={emojiPickerRef}
                        className="absolute -top-10 sm:top-1 right:0 sm:right-10  w-[270px] sm:w-[320px] h-[350px] sm:h-[380px] z-50
                          rounded-2xl bg-gradient-to-br from-white/95 to-gray-100/95 backdrop-blur-xl shadow-2xl"
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
                            setNewStatus(prev => prev + emojiObject.emoji)
                            setOpenMenu(null)
                          }}
                          theme={theme === 'dark' ? 'dark' : 'light'}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* file input (hidden) */}
                <div className="mb-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*, video/*, .heic, .heif"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={loading}
                  />
                  <button
                    onClick={() => fileInputRef.current.click()}
                    disabled={loading}
                    className={`w-full p-3 border-2 border-dashed border-gray-300 rounded-lg 
                      hover:border-green-400 transition-colors hover:text-green-500   
                      disabled:opacity-50 disabled:cursor-not-allowed ${theme === 'dark' ? "text-gray-300" : "text-gray-600"}`}
                  >
                    {selectedFile ? 'Change Media' : 'Add Photo/Video'}
                  </button>
                </div>

                {/* action buttons */}
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setShowCreateModal(false)
                      setNewStatus("")
                      setSelectedFile(null)
                      setFilePreview(null)
                    }}
                    disabled={loading}
                    className={`px-4 py-2 rounded transition-colors duration-150 hover:text-gray-700
                     hover:bg-gray-100 disabled:opacity-50 ${theme === 'dark' ? "text-gray-300" : "text-gray-600"}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateStatus}
                    disabled={loading || (!newStatus.trim() && !selectedFile)}
                    className="px-4 py-2 bg-green-500 text-white rounded transition-all duration-150
                     hover:bg-green-600 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default Status