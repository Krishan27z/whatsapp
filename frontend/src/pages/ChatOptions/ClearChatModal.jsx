import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaExclamationTriangle } from 'react-icons/fa'

const ClearChatModal = ({ isOpen, onClose, onConfirm, theme }) => {
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
            className={`p-6 rounded-xl max-w-sm w-full mx-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <FaExclamationTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold">Clear Chat?</h3>
            </div>
            <p className={`mb-6 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              All messages in this conversation will be deleted for you. The other person will still see them.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white"
              >
                Clear
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ClearChatModal