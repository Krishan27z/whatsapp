import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Layout from './Layout'
import ChatList from '../pages/ChatSection/ChatList'
import { getAllUsers } from '../services/user.service'
import { useChatStore } from '../stores/useChatStore'
import useUserStore from '../stores/useUserStore'
import { getSocket } from '../services/chat.service' // Added

function HomePage() {
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const { fetchConversations, setCurrentUser, conversations, initSocketListeners } = useChatStore()
  const { user, isLoading: userLoading } = useUserStore()

  //^ Memoized fetch function to prevent re-renders
  const fetchAllUsers = useCallback(async () => {
    try {
      const result = await getAllUsers()
      if (result.status === 'success') {
        setAllUsers(result.data)
      }
    } catch (error) {
      console.log("Error fetching users:", error)
      setError("Failed to load contacts")
    }
  }, [])

  // Initialize chat when user is available
  useEffect(() => {
    const initChat = async () => {
      if (!user) {
        console.log("Waiting for user to be available...")
        return
      }

      console.log("Initializing chat for user:", user._id)
      setLoading(true)
      setError(null)

      try {
        // Step 1: Set current user in chat store
        setCurrentUser(user)
        
        // Step 2: Initialize socket connection FIRST
        const socket = getSocket()
        if (socket && !socket.connected) {
          console.log("Socket not connected, waiting for connection...")
          // Socket will auto-connect via getSocket()
        }
        
        // Step 3: Fetch conversations (this will also init socket listeners)
        await fetchConversations()
        
        // Step 4: Fetch all users in parallel for better performance
        await fetchAllUsers()
        
        console.log("Chat initialization complete")
      } catch (error) {
        console.error("Chat initialization error:", error)
        setError("Failed to initialize chat")
      } finally {
        setLoading(false)
      }
    }

    // Only initialize when user is available and not loading
    if (user && !userLoading) {
      initChat()
    } else if (!user && !userLoading) {
      // User is not logged in
      setLoading(false)
    }
  }, [user, userLoading, fetchConversations, fetchAllUsers, setCurrentUser])

  // Handle socket connection status
  useEffect(() => {
    const socket = getSocket()
    
    const handleConnect = () => {
      console.log("Socket connected, re-initializing chat...")
      if (user) {
        // Re-fetch conversations on reconnection
        fetchConversations().catch(err => 
          console.error("Failed to fetch conversations on reconnect:", err)
        )
      }
    }
    
    if (socket) {
      socket.on('connect', handleConnect)
      
      return () => {
        socket.off('connect', handleConnect)
      }
    }
  }, [user, fetchConversations])

  // Log for debugging
  useEffect(() => {
    console.log("Chat Store Conversations:", conversations)
    console.log("All Users Count:", allUsers.length)
  }, [conversations, allUsers])

  // Show loading state
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading chat...</p>
          </div>
        </div>
      </Layout>
    )
  }

  // Show error state
  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-red-500">
            <p className="text-lg">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // Show empty state if no user
  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-gray-600">Please login to access chat</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className='h-full'
      >
        {/* Pass contacts and use chat store */}
        <ChatList contacts={allUsers} />
      </motion.div>
    </Layout>
  )
}

export default HomePage