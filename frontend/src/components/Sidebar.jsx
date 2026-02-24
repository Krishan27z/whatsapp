import React, { useEffect, useState, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useThemeStore from '../stores/useThemeStore'
import useUserStore from '../stores/useUserStore'
import useStatusStore from '../stores/useStatusStore'
import useLayoutStore from '../stores/useLayoutStore'
import { FaCog, FaUserCircle, FaWhatsapp } from 'react-icons/fa'
import { motion } from 'framer-motion'
import { IoMdRadioButtonOn } from "react-icons/io"

function Sidebar() {
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const { theme } = useThemeStore()
  const { user } = useUserStore()
  const { markAllStatusesAsViewed, setStatusTabActive, unseenStatusIds } = useStatusStore()
  const { activeTab, setActiveTab, selectedContact, setSelectedContact } = useLayoutStore()

  const isStatusTab = location.pathname === '/status'
  // 🔥 Real-time check for green dot
  const hasUnseen = unseenStatusIds.size > 0

  // 1. Update store's tab active flag & Clear dot if user enters Status tab
  useEffect(() => {
    setStatusTabActive(isStatusTab)
    
    if (isStatusTab && hasUnseen && user?._id) {
        // Jodi user Status page e dhuke, auto-remove dot
        markAllStatusesAsViewed(user._id)
    }
  }, [isStatusTab, setStatusTabActive, hasUnseen, user?._id, markAllStatusesAsViewed])

  // 2. Update active tab based on URL
  useEffect(() => {
    if (location.pathname === '/') setActiveTab("chats")
    else if (location.pathname === '/status') setActiveTab("status")
    else if (location.pathname === '/user-profile') setActiveTab("profile")
    else if (location.pathname === '/setting') setActiveTab("setting")
  }, [location.pathname, setActiveTab])

  // Handle status tab click
  const handleStatusClick = useCallback(() => {
    if (user?._id) {
      markAllStatusesAsViewed(user._id)
    }
    if (isMobile) setSelectedContact(null)
  }, [user?._id, markAllStatusesAsViewed, isMobile, setSelectedContact])

  // Detect screen resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  if (isMobile && selectedContact) return null

  //! MOBILE BOTTOM NAVIGATION
  if (isMobile) {
    return (
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`fixed bottom-0 left-0 right-0 h-16 border-t z-40 flex items-center justify-around px-2
          ${theme === 'dark' ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}
      >
        {/* Chats */}
        <Link
          to='/'
          className={`flex flex-col items-center justify-center flex-1 
              ${activeTab === "chats" ?
              theme === "dark" ? "" : "bg-green-100 shadow-sm p-0.5 rounded-full"
              : ""}`}
        >
          <FaWhatsapp
            className={`h-6 w-6 ${activeTab === 'chats'
              ? theme === "dark" ? "text-green-500" : "text-green-600"
              : theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
          />
          <span className={`text-xs font-medium text-gray-400 
              ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>Chats</span>
        </Link>

        {/* Status */}
        <Link
          to='/status'
          className={`relative flex flex-col items-center justify-center flex-1  
              ${activeTab === "status"
              ? theme === "dark" ? "" : "bg-green-100 shadow-sm p-0.5 rounded-full"
              : ""}`}
          onClick={() => {
            handleStatusClick()
            if (isMobile) setSelectedContact(null)
          }}
        >
          <div className="relative inline-block">
            <IoMdRadioButtonOn
              className={`h-6 w-6 ${activeTab === 'status'
                ? theme === "dark" ? "text-green-500" : "text-green-600"
                : theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
            />
            {/* Green dot – only when unseen exist and not on status tab */}
            {hasUnseen && !isStatusTab && (
              <span
                className="absolute bottom-2 left-4 w-2.5 h-2.5 bg-green-500 rounded-full border-2 
                    transform translate-x-1/2 -translate-y-1/2 border-none z-50"
              />
            )}
          </div>
          <span className={`text-xs font-medium text-gray-400 ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>
            Status
          </span>
        </Link>

        {/* Profile */}
        <Link
          to='/user-profile'
          className={`flex flex-col items-center justify-center flex-1  
                    ${activeTab === "profile" ?
              theme === "dark" ? "" : "bg-green-100 shadow-sm p-0.5 rounded-full"
              : ""}`}
          onClick={() => isMobile && setSelectedContact(null)}
        >
          {user?.profilePicture ? (
            <div className="w-8 h-8 flex-shrink-0 ml-1 rounded-full overflow-hidden">
              <div className="w-full h-full rounded-full overflow-hidden bg-white">
                <img
                  src={user?.profilePicture}
                  alt={user?.username}
                  className="min-w-full min-h-full object-cover object-center mb-1"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${user?.username}&background=random`;
                  }}
                />
              </div>
            </div>
          ) : (
            <FaUserCircle
              className={`h-8 w-8 ${activeTab === 'profile'
                ? theme === "dark" ? "text-green-500" : "text-green-600"
                : theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
            />
          )}
          <span className={`text-xs font-medium text-gray-400 
              ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>Profile</span>
        </Link>

        {/* Settings */}
        <Link
          to='/setting'
          className={`flex flex-col items-center justify-center flex-1  
                    ${activeTab === "setting" ?
              theme === "dark" ? "" : "bg-green-100 shadow-sm p-0.5 rounded-full"
              : ""}`}
          onClick={() => isMobile && setSelectedContact(null)}
        >
          <FaCog
            className={`h-6 w-6 ${activeTab === 'setting'
              ? theme === "dark" ? "text-green-500" : "text-green-600"
              : theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
          />
          <span className={`text-xs font-medium text-gray-400 
              ${theme === "dark" ? "text-gray-400" : "text-gray-700"}`}>Setting</span>
        </Link>
      </motion.div>
    )
  }

  //! DESKTOP SIDEBAR
  const SidebarContent = (
    <>
      {/* Chats */}
      <Link
        to='/'
        className={`focus:outline-none mb-8 
        ${activeTab === "chats" ? "bg-gray-300 shadow-sm p-2 rounded-full" : ""}`}
      >
        <FaWhatsapp
          className={`h-6 w-6 ${activeTab === 'chats'
            ? theme === "dark" ? "text-gray-800" : ""
            : theme === "dark" ? "text-gray-300" : "text-gray-800"}`}
        />
      </Link>

      {/* Status */}
      <Link
        to='/status'
        className={`focus:outline-none mb-8 relative
        ${activeTab === "status" ? "bg-gray-300 shadow-sm p-1.5 rounded-full" : ""}`}
        onClick={() => {
          handleStatusClick()
          if (!isMobile) setSelectedContact(null)
        }}
      >
        <div className="relative inline-block">
          <IoMdRadioButtonOn
            className={`h-6 w-6 ${activeTab === 'status'
              ? theme === "dark" ? "text-green-500" : "text-green-600"
              : theme === "dark" ? "text-gray-400" : "text-gray-700"}`}
          />
          {/* Green dot – only when unseen exist and not on status tab */}
          {hasUnseen && !isStatusTab && (
            <span
              className="absolute bottom-3 left-3 w-2.5 h-2.5 bg-green-400 rounded-full border-2 
                  transform translate-x-1/2 -translate-y-1/2 border-none z-50"
            />
          )}
        </div>
      </Link>

      <div className='flex-grow' />

      {/* Profile */}
      <Link
        to='/user-profile'
        className={`focus:outline-none mb-8 
        ${activeTab === "profile" ? "bg-gray-300 shadow-sm p-1 rounded-full" : ""}`}
        onClick={() => !isMobile && setSelectedContact(null)}
      >
        {user?.profilePicture ? (
          <div className={`w-9 h-9 flex-shrink-0 ml-1 rounded-full overflow-hidden transition-all duration-300 ease-out hover:scale-110
              hover:ring-2 hover:ring-offset-2 hover:ring-offset-transparent
              ${theme === 'dark' ? "hover:ring-green-500" : "hover:ring-green-300"}`}
          >
            <div className="w-full h-full rounded-full overflow-hidden bg-white">
              <img
                src={user?.profilePicture}
                alt={user?.username}
                className="min-w-full min-h-full object-cover object-center transition-transform duration-300 
                  ease-out group-hover:scale-110"
                onError={(e) => {
                  e.target.src = `https://ui-avatars.com/api/?name=${user?.username}&background=random`;
                }}
              />
            </div>
          </div>
        ) : (
          <FaUserCircle
            className={`h-8 w-8 ${activeTab === 'profile'
              ? theme === "dark" ? "text-gray-800" : ""
              : theme === "dark" ? "text-gray-300" : "text-gray-800"}`}
          />
        )}
      </Link>

      {/* Settings */}
      <Link
        to='/setting'
        className={`focus:outline-none mb-8 
        ${activeTab === "setting" ? "bg-gray-300 shadow-sm p-2 rounded-full" : ""}`}
        onClick={() => !isMobile && setSelectedContact(null)}
      >
        <FaCog
          className={`h-6 w-6 ${activeTab === 'setting'
            ? theme === "dark" ? "text-gray-800" : ""
            : theme === "dark" ? "text-gray-300" : "text-gray-800"}`}
        />
      </Link>
    </>
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`w-16 h-screen border-r-2 flex flex-col items-center py-4 shadow-lg
        ${theme === 'dark' ? "bg-gray-800 border-gray-600" : "bg-[rgba(239,242,254)] border-gray-200"}`}
    >
      {SidebarContent}
    </motion.div>
  )
}

export default Sidebar