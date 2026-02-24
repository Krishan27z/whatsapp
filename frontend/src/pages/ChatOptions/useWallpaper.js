import { useState, useEffect, useRef } from 'react'

export const useWallpaper = (conversationId, contactId, theme) => {
  const [wallpaper, setWallpaper] = useState('')
  const prevConversationIdRef = useRef(conversationId)

  const getStorageKey = () => {
    if (conversationId) return `wallpaper_${conversationId}`
    if (contactId) return `tempWallpaper_${contactId}`
    return null
  }

  useEffect(() => {
    const key = getStorageKey()
    if (!key) {
      setWallpaper('')
      return
    }
    const saved = localStorage.getItem(key)
    setWallpaper(saved || '')
  }, [conversationId, contactId])

  useEffect(() => {
    const prevId = prevConversationIdRef.current
    if (!prevId && conversationId && contactId) {
      const tempKey = `tempWallpaper_${contactId}`
      const tempWallpaper = localStorage.getItem(tempKey)
      if (tempWallpaper) {
        localStorage.setItem(`wallpaper_${conversationId}`, tempWallpaper)
        localStorage.removeItem(tempKey)
        setWallpaper(tempWallpaper)
      }
    }
    prevConversationIdRef.current = conversationId
  }, [conversationId, contactId])

  const changeWallpaper = (value) => {
    const key = getStorageKey()
    if (!key) return
    localStorage.setItem(key, value)
    setWallpaper(value)
  }

  const getWallpaperStyle = () => {
    if (wallpaper) {
      if (wallpaper.startsWith('#')) return { backgroundColor: wallpaper }
      if (wallpaper.startsWith('url')) return { backgroundImage: wallpaper, backgroundSize: 'cover', backgroundPosition: 'center' }
      return {}
    } else {
      // Default theme backgrounds
      if (theme === 'dark') {
        return { background: 'linear-gradient(to bottom, #1f2937, #111827)' } // from-gray-800 to-gray-900
      } else {
        return { backgroundColor: '#efe5dd' }
      }
    }
  }

  return { wallpaper, changeWallpaper, getWallpaperStyle }
}