import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaImage, FaPalette, FaTimes } from 'react-icons/fa'

const presetColors = [
  '#efe5dd', // WhatsApp light default
  '#d9f0ec',
  '#f0f0d9',
  '#e0d9f0',
  '#f0d9e0',
  '#2a3f45', // dark mode suggestions
  '#1e2a2f',
  '#2d2d2d',
  '#3b2e2e',
  '#1f3a3a',
]

const WallpaperModal = ({ isOpen, onClose, onSelect, theme }) => {
  const [selectedColor, setSelectedColor] = useState('')

  const handleColorSelect = (color) => {
    setSelectedColor(color)
    onSelect('color', color)
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      onSelect('image', event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleReset = () => {
    onSelect('reset', '')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className={`p-6 rounded-xl max-w-md w-full mx-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                Change Wallpaper
              </h3>
              <button 
                onClick={onClose} 
                className={`p-2 rounded-full ${theme === 'dark' ? "hover:bg-gray-700" : "hover:bg-green-100"}`}
              >
                <FaTimes className='w-5 h-5' />
              </button>
            </div>

            {/* Preset colors */}
            <div className="mb-4">
              <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Colors</p>
              <div className="grid grid-cols-5 gap-2">
                {presetColors.map(color => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    className="w-10 h-10 rounded-full border-2 border-transparent hover:border-green-500 transition-all"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Upload image */}
            <div className="mb-4">
              <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Upload image</p>
              <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-lg cursor-pointer
                ${theme === 'dark' ? 'border-gray-600 hover:border-green-400' : 'border-gray-300 hover:border-green-500'}`}>
                <FaImage />
                <span>Choose an image</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {/* Reset to default */}
            <button
              onClick={handleReset}
              className={`w-full py-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
            >
              Reset to default
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default WallpaperModal