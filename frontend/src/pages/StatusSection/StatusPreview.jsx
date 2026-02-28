import React, { useEffect, useState, useRef, useCallback, useLayoutEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import formatTimestamp from '../../utils/formatTime'
import { FaChevronDown, FaEye, FaTimes, FaTrash, FaHeart, FaSpinner } from 'react-icons/fa'
import useStatusStore from '../../stores/useStatusStore'
import { useShallow } from 'zustand/react/shallow'

//* ========== 🚀 CUSTOM HOOK: SMOOTH PROGRESS BAR ==========
//* This hook creates a progress bar that advances smoothly using requestAnimationFrame.
//* It pauses when the tab is hidden and resumes when visible.
//* Parameters:
//*   isActive    - whether the progress should run
//*   duration    - total time in ms for full progress
//*   onComplete  - callback when progress reaches 100%
//*   resetKey    - when this changes, the progress resets to 0
const useSmoothProgress = (isActive, duration = 5000, onComplete, resetKey) => {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef(null)
  const startTimeRef = useRef(null)
  const durationRef = useRef(duration)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { durationRef.current = duration }, [duration])

  useLayoutEffect(() => {
    setProgress(0)
    startTimeRef.current = null
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [resetKey])

  useEffect(() => {
    if (!isActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const frame = () => {
      if (!startTimeRef.current) startTimeRef.current = Date.now()
      const elapsed = Date.now() - startTimeRef.current
      const newProgress = Math.min((elapsed / durationRef.current) * 100, 100)
      setProgress(newProgress)

      if (newProgress < 100) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        onCompleteRef.current?.()
      }
    }

    rafRef.current = requestAnimationFrame(frame)

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      } else {
        startTimeRef.current = Date.now() - (progress / 100) * durationRef.current
        rafRef.current = requestAnimationFrame(frame)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isActive, resetKey, progress])

  return progress
}

//! ========== MAIN STATUS PREVIEW COMPONENT ==========
//! This modal displays a single status (image/video/text) with controls.
//! It has two distinct modes:
//!   - OWNER VIEW (sender) – shows delete button, viewers count and list, flying hearts on new likes.
//!   - RECEIVER VIEW – shows a like button at the bottom.
//! The progress bars at the top indicate time remaining for each status in the group.
function StatusPreview({ contact, currentIndex, onClose, onNext, onPrev, theme, currentUser }) {
  //^ ---------- LOCAL STATE ----------
  const [showViewers, setShowViewers] = useState(false)        // toggle viewers dropdown
  const [isMediaLoaded, setIsMediaLoaded] = useState(false)    // used to start progress only after media loads

  //~ Flying hearts for owner (triggered when a new like arrives)
  const [senderHearts, setSenderHearts] = useState([]);
  const viewersCountRef = useRef(null);                         // ref to the viewers count button (for heart animation origin)

  //& ---------- STORE SELECTORS ----------
  const contactId = contact?.id
  const allStatuses = useStatusStore(state => state.statuses)
  const viewersMap = useStatusStore(state => state.statusViewersMap)
  const reactionsMap = useStatusStore(state => state.statusReactionsMap)
  const realTimeMap = useStatusStore(state => state.realTimeStatuses)

  const { reactToStatus, removeReaction, deleteStatus, viewStatus } = useStatusStore()

  //* ---------- MEMOIZED GROUPED STATUS ----------
  //* Re‑organise all statuses into a structure keyed by user ID for easy access.
  //* Also merges real‑time updates from the socket.
  useEffect(() => {
    setIsMediaLoaded(false)   // reset media loaded flag when switching statuses
  }, [currentIndex, contact?.id])

  const groupedStatus = useMemo(() => {
    return allStatuses.reduce((acc, status) => {
      const statusUserId = status.user?._id
      if (!statusUserId) return acc
      const realTimeStatus = realTimeMap.get(status._id) || status
      if (!acc[statusUserId]) {
        acc[statusUserId] = {
          id: statusUserId,
          name: realTimeStatus.user?.username,
          avatar: realTimeStatus.user?.profilePicture,
          statuses: [],
        }
      }
      // viewersMap now stores array of { user, viewedAt } with guaranteed user objects
      const viewers = viewersMap.get(status._id) || []
      const reactions = reactionsMap.get(status._id) || []

      let media = null
      let caption = ''

      if (realTimeStatus.contentType === 'text') {
        caption = realTimeStatus.content
        media = null
      } else {
        media = realTimeStatus.content
        caption = realTimeStatus.caption || realTimeStatus.text || ''
      }

      acc[statusUserId].statuses.push({
        id: realTimeStatus._id,
        media: media,
        contentType: realTimeStatus.contentType,
        duration: realTimeStatus.duration,
        timeStamp: realTimeStatus.createdAt,
        viewers,          // array of { user, viewedAt }
        reactions,
        shareCount: realTimeStatus.shareCount || 0,
        reactionCount: reactions.length,
        caption: caption,
      })
      acc[statusUserId].statuses.sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp))
      return acc
    }, {})
  }, [allStatuses, viewersMap, reactionsMap, realTimeMap])

  const freshContact = contactId ? groupedStatus[contactId] : null
  const activeContact = freshContact || contact
  const currentStatus = activeContact?.statuses?.[currentIndex]
  const statusId = currentStatus?.id

  //& ---------- STORE SELECTORS FOR CURRENT STATUS ----------
  // viewers is an array of { user, viewedAt } for this specific status
  const viewers = useStatusStore(
    useShallow(state => state.statusViewersMap.get(statusId) || [])
  )

  const reactions = useStatusStore(
    useShallow(state => state.statusReactionsMap.get(statusId) || currentStatus?.reactions || [])
  )

  const isOwnerStatus = activeContact?.id === currentUser?._id   // true if I am the sender

  //! ---------- 🔥 VIEW STATUS (mark as seen) ----------
  // When a receiver opens a status they haven't seen before, call viewStatus API.
  // The optimistic update is handled inside the store.
  useEffect(() => {
    if (statusId && !isOwnerStatus && currentUser?._id) {
      const currentViewers = useStatusStore.getState().statusViewersMap.get(statusId) ||
        currentStatus?.viewers || [];

      const alreadySeen = currentViewers.some(v =>
        v.user?._id?.toString() === currentUser?._id?.toString()
      );

      if (!alreadySeen) {
        viewStatus(statusId).catch(err => console.error('❌ viewStatus failed:', err));
      }
    }
  }, [statusId, isOwnerStatus, currentUser?._id, viewStatus, currentStatus?.viewers])

  //& ---------- CLOSE MODAL IF CURRENT STATUS DELETED ----------
  useEffect(() => {
    if (!currentStatus) onClose()
  }, [currentStatus, onClose])

  //* ---------- PROGRESS DURATION (video vs image/text) ----------
  const statusDuration = useMemo(() => {
    if (currentStatus?.contentType === 'video') {
      return (currentStatus.duration || 30) * 1000   // use video duration or default 30s
    }
    return 8000  // 8 seconds for images/text
  }, [currentStatus])

  const isProgressActive = useMemo(() => {
    if (!currentStatus) return false
    if (currentStatus.contentType === 'text') return true      // text has no media to load
    return isMediaLoaded                                       // wait for image/video to load
  }, [currentStatus, isMediaLoaded])

  const onNextCallback = useCallback(() => onNext?.(), [onNext])

  const progress = useSmoothProgress(
    isProgressActive,
    statusDuration,
    onNextCallback,
    statusId || 'no-status'
  )

  //~ ---------- 🔥 LIKE HANDLER (receiver) ----------
  const isLiked = reactions.some(r => r.user?._id === currentUser?._id || r.user === currentUser?._id)

  //~ Flying hearts animation for owner when a new like arrives
  const triggerSenderFlyingHearts = useCallback(() => {
    if (!viewersCountRef.current) return;
    const rect = viewersCountRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const newHearts = Array.from({ length: 15 }).map((_, i) => ({
      id: Math.random(),
      startX: centerX,
      startY: centerY,
      offsetX: (Math.random() - 0.5) * 300,
      yEnd: -(160 + Math.random() * 140),
      scaleStart: 0.4 + Math.random() * 0.4,
      scaleEnd: 1.5 + Math.random() * 0.7,
      rotationStart: (Math.random() - 0.5) * 20,
      rotationEnd: (Math.random() - 0.5) * 60,
      delay: i * 0.05,
    }));
    setSenderHearts(prev => [...prev, ...newHearts]);

    setTimeout(() => {
      setSenderHearts(prev => prev.filter(h => !newHearts.includes(h)));
    }, 2000);
  }, []);

  const prevReactionsLengthRef = useRef(reactions.length);

  // Detect when reactions count increases (new like on owner's status)
  useEffect(() => {
    if (isOwnerStatus && reactions.length > prevReactionsLengthRef.current) {
      triggerSenderFlyingHearts();
    }
    prevReactionsLengthRef.current = reactions.length;
  }, [reactions.length, isOwnerStatus, triggerSenderFlyingHearts])


  // 🔥 Trigger flying hearts every time the owner views their status (if they have any likes)
  useEffect(() => {
    if (isOwnerStatus && reactions.length > 0) {
      triggerSenderFlyingHearts();
    }
  }, [isOwnerStatus, currentIndex, reactions.length, triggerSenderFlyingHearts])


  const handleLike = useCallback(async () => {
    if (!statusId || !currentUser?._id) return;
    try {
      if (!isLiked) {
        await reactToStatus(statusId, 'love', currentUser._id);
      } else {
        await removeReaction(statusId, currentUser._id);
      }
    } catch (error) { console.error('Reaction failed:', error); }
  }, [isLiked, statusId, currentUser?._id, reactToStatus, removeReaction]);

  //! ---------- DELETE HANDLER (owner only) ----------
  const handleDeleteStatus = useCallback(async () => {
    if (!statusId) return
    try {
      await deleteStatus(statusId)
      onClose()
    } catch (error) {
      console.error('❌ Delete failed:', error)
    }
  }, [statusId, deleteStatus, onClose])

  //* ---------- TAP TO NAVIGATE ----------
  // Left third of screen -> previous status, right third -> next status.
  const handleScreenTap = useCallback((e) => {
    const screenWidth = window.innerWidth
    const tapX = e.clientX
    if (tapX < screenWidth / 3 && currentIndex > 0) onPrev()
    else if (tapX > (2 * screenWidth) / 3) onNext()
  }, [currentIndex, onPrev, onNext])

  if (!currentStatus) return null

  //& ---------- THEME-BASED CLASSES ----------
  const isDarkMode = theme === 'dark'
  const bgClass = isDarkMode ? 'bg-black' : 'bg-gray-50'
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900'
  const secondaryTextClass = isDarkMode ? 'text-gray-300' : 'text-gray-600'
  const cardBgClass = isDarkMode ? 'bg-gray-900/90' : 'bg-white/95'
  const buttonBgClass = isDarkMode ? 'bg-gray-800/70' : 'bg-gray-200/70'
  const progressBgClass = isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
  const progressFillClass = 'bg-green-500'

  //^ ---------- RENDER VIEWERS LIST (owner only) ----------
  const renderViewersList = () => {
    if (viewers.length === 0) {
      return <p className={`text-center py-6 ${secondaryTextClass}`}>No viewers yet</p>;
    }

    //! Sort viewers by viewedAt timestamp (newest first)
    const sortedViewers = [...viewers].sort((a, b) => {
      const dateA = new Date(a.viewedAt || a.user?.viewedAt || 0);
      const dateB = new Date(b.viewedAt || b.user?.viewedAt || 0);
      return dateB - dateA; //& descending (newest first)
    })

    return (
      <div className="space-y-3">
        {sortedViewers.map((entry) => {
          //& Safety: handle both object and string formats
          let user, viewedAt;

          if (typeof entry === 'object' && entry !== null) {
            if (entry.user) {
              //& New format: { user: {...}, viewedAt }
              user = entry.user;
              viewedAt = entry.viewedAt;
            } else if (entry._id) {
              //& Old format: just user object
              user = entry;
              viewedAt = entry.viewedAt || new Date().toISOString();
            } else {
              console.warn('⚠️ Unknown entry format:', entry);
              return null;
            }
          } else if (typeof entry === 'string') {
            //&  Fallback: just a user ID
            user = {
              _id: entry,
              username: 'User',
              profilePicture: `https://ui-avatars.com/api/?name=User&background=random`
            };
            viewedAt = new Date().toISOString();
          } else {
            return null;
          }

          if (!user || !user._id) return null;

          //& Check if this user liked
          const viewerLiked = reactions.some(r => {
            const rId = r.user?._id?.toString() || r.user?.toString();
            return rId === user._id.toString();
          });

          const displayName = user.username || 'User';
          const avatarUrl = user.profilePicture || `https://ui-avatars.com/api/?name=${displayName}&background=random`;

          return (
            <motion.div
              key={user._id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between p-3 rounded-xl"
            >
              <div className="flex items-center space-x-3 md:space-x-4">
                <div className="relative">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white object-cover shadow"
                  />
                  {viewerLiked && (
                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-md">
                      <FaHeart className="h-3 w-3 md:h-4 md:w-4 text-green-500" />
                    </div>
                  )}
                </div>
                <div>
                  <p className={`font-medium ${textClass}`}>{displayName}</p>
                  <p className={`text-xs ${secondaryTextClass}`}>
                    Viewed {formatTimestamp(viewedAt)}
                  </p>
                </div>
              </div>
              {viewerLiked && <FaHeart className="h-5 w-5 text-green-500" />}
            </motion.div>
          );
        })}
      </div>
    );
  }



  //! ========== JSX RENDER ==========
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 ${bgClass} z-[9999] flex items-center justify-center`}
    >
      <div className="relative w-full h-full max-w-[100vw] md:max-w-[85vw] lg:max-w-[75vw] xl:max-w-[65vw] mx-auto flex items-center justify-center">
        {/* //~ Background overlay closes modal when clicked */}
        <div className="absolute inset-0 bg-transparent" onClick={onClose} />
        <div className="relative w-full h-full overflow-hidden" onClick={handleScreenTap}>

          {/* //^ PROGRESS BARS (one per status) */}
          <div className="absolute top-0 left-0 right-0 flex gap-1 p-3 md:p-4 z-50">
            {activeContact?.statuses?.map((status, index) => {
              const isViewed = index < currentIndex
              const isCurrent = index === currentIndex
              return (
                <div
                  key={status.id}
                  className={`flex-1 h-1.5 ${progressBgClass} bg-opacity-50 rounded-full overflow-hidden`}
                >
                  <div
                    className={`h-full ${progressFillClass} rounded-full`}
                    style={{
                      width: isViewed ? '100%' : isCurrent ? `${progress}%` : '0%'
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* //^ HEADER: avatar, name, timestamp + close button */}
          <div className="absolute top-6 md:top-8 left-4 md:left-6 right-4 md:right-6 z-50 flex items-center justify-between">
            <div className="flex items-center space-x-2 md:space-x-3">
              <motion.div whileHover={{ scale: 1.05 }} className="relative">
                <img
                  src={activeContact?.avatar}
                  alt={activeContact?.name}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full border-3 border-white shadow-lg object-cover"
                />
              </motion.div>
              <div>
                <p className={`font-bold text-base md:text-lg ${textClass}`}>
                  {activeContact?.name}
                </p>
                <p className={`text-xs md:text-sm ${secondaryTextClass}`}>
                  {formatTimestamp(currentStatus.timeStamp)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className={`${buttonBgClass} backdrop-blur-sm rounded-full p-2 md:p-3 shadow-lg cursor-pointer`}
              >
                <FaTimes className={`h-5 w-5 md:h-6 md:w-6 ${secondaryTextClass}`} />
              </motion.button>
            </div>
          </div>

          {/* //& STATUS CONTENT (text, image, or video + optional caption) */}
          <div className="w-full h-full flex flex-col items-center justify-center p-4 md:p-8 mt-2">
            {currentStatus?.contentType === 'text' ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center max-w-2xl p-6 md:p-10"
              >
                <div className={`${cardBgClass} backdrop-blur-xl rounded-3xl p-8 md:p-12 shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <p className={`text-2xl md:text-4xl font-semibold leading-relaxed ${textClass}`}>
                    {currentStatus?.caption || currentStatus?.media}
                  </p>
                </div>
              </motion.div>
            ) : (
              <>
                <div className={`w-full flex-1 flex items-center justify-center min-h-0 
                  ${theme === 'dark' ? "bg-gray-900/30" : "bg-green-50"}`}
                >
                  {currentStatus?.contentType === 'image' ? (
                    <>
                      {!isMediaLoaded && (
                        <div className="flex flex-col items-center justify-center">
                          <FaSpinner className={`h-12 w-12 animate-spin ${secondaryTextClass}`} />
                        </div>
                      )}
                      <motion.img
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: isMediaLoaded ? 1 : 0 }}
                        src={currentStatus?.media}
                        alt="status"
                        className={`max-h-[60vh] max-w-full object-contain rounded-2xl shadow-2xl ${!isMediaLoaded && 'hidden'}`}
                        onLoad={() => setIsMediaLoaded(true)}
                        onError={() => setIsMediaLoaded(true)}
                      />
                    </>
                  ) : currentStatus?.contentType === 'video' ? (
                    <>
                      {!isMediaLoaded && (
                        <div className="flex flex-col items-center justify-center">
                          <FaSpinner className={`h-12 w-12 animate-spin ${secondaryTextClass}`} />
                        </div>
                      )}
                      <motion.video
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: isMediaLoaded ? 1 : 0 }}
                        src={currentStatus?.media}
                        controls
                        autoPlay
                        muted
                        className={`max-h-[60vh] max-w-full object-contain rounded-2xl shadow-2xl ${!isMediaLoaded && 'hidden'}`}
                        onLoadedData={() => setIsMediaLoaded(true)}
                        onError={() => setIsMediaLoaded(true)}
                      />
                    </>
                  ) : null}
                </div>

                {/* //^ Caption below media */}
                {currentStatus?.caption && currentStatus.contentType !== 'text' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`-mt-12 mb-28 md:mb-18 max-w-2xl w-full ${cardBgClass} 
                      backdrop-blur-xl rounded-2xl p-2 md:p-3 shadow-xl border
                      ${isDarkMode ? 'border-gray-500' : 'border-gray-200'}`}
                  >
                    <p className={`text-base md:text-lg leading-relaxed ${textClass} text-center`}>
                      {currentStatus.caption}
                    </p>
                  </motion.div>
                )}
              </>
            )}
          </div>

          {/* //! OWNER VIEW – delete, viewers count/list, flying hearts */}
          {isOwnerStatus && (
            <div className="absolute bottom-6 left-4 right-4 z-50">
              <div className="flex justify-between items-center">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteStatus(); }}
                  className="p-3 bg-red-500/90 hover:bg-red-600 rounded-full transition-all shadow-lg backdrop-blur-sm"
                >
                  <FaTrash className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </motion.button>

                <div className="flex-1 flex justify-center">
                  <motion.button
                    ref={viewersCountRef}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => { e.stopPropagation(); setShowViewers(!showViewers); }}
                    className={`flex items-center space-x-3 px-5 py-3 cursor-pointer 
                      ${buttonBgClass} backdrop-blur-sm rounded-full transition-all shadow-lg`}
                  >
                    <FaEye className={`h-5 w-5 ${textClass}`} />
                    <span className={`font-medium ${textClass}`}>{viewers.length}</span>
                    <FaChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${showViewers ? 'rotate-180' : ''} ${secondaryTextClass}`}
                    />
                  </motion.button>
                </div>
                <div className="w-12" />
              </div>

              {/* //& Viewers dropdown list */}
              <AnimatePresence>
                {showViewers && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    className={`mt-4 ${isDarkMode ? 'bg-gray-900/95' : 'bg-white/95'} backdrop-blur-xl rounded-2xl p-4 max-h-48 md:max-h-64 overflow-y-auto shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}
                  >
                    {renderViewersList()}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* //~ Sender side flying hearts animation */}
              <AnimatePresence>
                {senderHearts.map(heart => (
                  <motion.div
                    key={heart.id}
                    initial={{
                      opacity: 1,
                      scale: heart.scaleStart,
                      rotate: heart.rotationStart,
                      x: heart.startX,
                      y: heart.startY,
                      position: 'fixed',
                      left: 0,
                      top: 0,
                      pointerEvents: 'none',
                      zIndex: 9999,
                    }}
                    animate={{
                      opacity: 0,
                      scale: heart.scaleEnd,
                      rotate: heart.rotationEnd,
                      x: heart.startX + heart.offsetX,
                      y: heart.startY + heart.yEnd,
                    }}
                    transition={{
                      duration: 1.8,
                      delay: heart.delay,
                      ease: [0.25, 0.1, 0.25, 1],
                      scale: { duration: 1.8, ease: "easeOut" },
                      rotate: { duration: 1.8, ease: "linear" },
                    }}
                    className="text-green-500"
                    style={{ willChange: 'transform' }}
                  >
                    <FaHeart className="h-10 w-10" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* //! RECEIVER VIEW – bottom like button (no flying hearts) */}
          {!isOwnerStatus && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`flex items-center gap-4 p-2 ${buttonBgClass} backdrop-blur-xl rounded-full shadow-2xl`}
              >
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleLike()
                  }}
                  className={`p-3 rounded-full transition-all duration-300 shadow-lg
                      ${isLiked
                      ? 'bg-green-500 hover:bg-emerald-300 shadow-emerald-400/50'
                      : isDarkMode
                        ? 'bg-gray-800/80 hover:bg-gray-700/80'
                        : 'bg-gray-300/80 hover:bg-gray-400/80'
                    }`}
                >
                  <FaHeart className={`h-6 w-6 ${isLiked ? 'text-white' : secondaryTextClass}`} />
                </motion.button>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default StatusPreview