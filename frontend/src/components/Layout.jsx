import React, { useEffect, useState } from 'react'
import useLayoutStore from '../stores/useLayoutStore'
import { useLocation } from 'react-router-dom'
import useThemeStore from '../stores/useThemeStore'
import Sidebar from './Sidebar'
import ChatWindow from '../pages/ChatSection/ChatWindow'
import { AnimatePresence, motion } from 'framer-motion'

/*
~  1️⃣children: Child components rendered inside this Layout (HomePage, ChatPage etc.)
?  2️⃣isThemeDialogOpen:  Boolean → is theme dialog open or not
?  3️⃣toggleThemeDialog:  Function → open/close theme dialog
?  4️⃣isStatusPreviewOpen:  Boolean → is status preview open
?  5️⃣statusPreviewContent: Data/content for status preview
*/
function Layout({ children, isThemeDialogOpen, toggleThemeDialog, isStatusPreviewOpen, statusPreviewContent }) {
  const selectedContact = useLayoutStore(state => state.selectedContact) //& Get currently selected contact from layout store (Zustand)
  const setSelectedContact = useLayoutStore(state => state.setSelectedContact) //& Function to update selected contact in layout store
  const location = useLocation() //& Gives information about current URL/path [Example: "/", "/user-login" etc.]
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768) //& State to check if screen is mobile size
  //& Initial value is calculated using window width
  const { theme, setTheme } = useThemeStore() //& Get current theme and function to update theme



  //^ Effect to detect screen resize (responsive UI) ----------
  useEffect(() => {
    const handleResize = () => {  //& Function that runs when window size changes
      setIsMobile(window.innerWidth < 768) //~ If screen width < 768px → treat as mobile view
    }
    window.addEventListener("resize", handleResize) //& Attach resize event listener to browser window
    return () => window.removeEventListener("resize", handleResize) //~ Cleanup: remove event listener when component unmounts
  }, [])  //? Empty dependency array → runs only once when component mounts



  return (
    <div className={`h-screen w-screen flex relative overflow-hidden
      ${theme === 'dark' ? "bg-[#111b21] text-white" : "bg-gray-100 text-black"}`}
    >
      {/* //^ -------- DESKTOP SIDEBAR (in LEFT) --------- */}
      {!isMobile && <Sidebar />}
      <div
        className={`flex flex-1 overflow-hidden min-w-0 ${isMobile ? "flex-col" : ""}`}
      >
        <AnimatePresence initial={false}> {/*//& AnimatePresence allows smooth enter/exit animations */}

          {/* //^ ---------- CHAT LIST (LEFT SIDE ON DESKTOP / MAIN ON MOBILE) -----------  */}
          {/*//&  [i] On desktop: always show chat list, [ii] On mobile: show chat list ONLY if no contact is selected  */}
          {(!selectedContact || !isMobile) && (
            <motion.div
              key="chatlist"
              initial={{ x: isMobile ? "-100%" : 0 }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween" }}
              className={`w-full md:basis-[360px] md:max-w-[400px] h-full shrink-0 min-w-0 ${isMobile ? "pb-16" : ""}`}
            >
              {children}   {/*//~ children → Renders the component/page wrapped inside <Layout>...</Layout> (e.g., ChatList / HomePage) */}
            </motion.div>
          )}

          {/* //^ ---------- CHAT WINDOW -----------  */}
          {/*//& Show chat window when: (i) On desktop: always show chat window, (ii) On mobile: show only when a contact is selected */}
          {(selectedContact || !isMobile) && (
            <motion.div
              key="chatWindow"
              initial={{ x: isMobile ? "-100%" : 0 }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween" }}
              className="flex-1 h-full min-w-0 overflow-hidden"
            >
              {/*//! ----- These 3 props will be sent to '/src/pages/ChatSection/ChatWindow.jsx' file ----- */}
              <ChatWindow
                selectedContact={selectedContact}
                setSelectedContact={setSelectedContact}
                isMobile={isMobile}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* //^ --------  MOBILE SIDEBAR (at BOTTOM)   ----------- */}
      {/*//&  Bcz, On mobile, sidebar becomes bottom navigation  */}
      {isMobile && <Sidebar />}

      {/*//^ ---------- THEME DIALOG ----------  */}
      {/*//&  Allows user to switch between light/dark theme  */}
      {isThemeDialogOpen && (
        <div className='fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 px-4'>
          <div
            className={`p-6 sm:p-7 rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md transition-all duration-300
        ${theme === 'dark'
                ? "bg-[#1f2c34] text-white border border-gray-700"
                : "bg-white text-gray-900 border border-gray-200"
              }`}
          >
            <h2 className='text-xl sm:text-2xl font-semibold mb-6 text-center'>
              Choose a theme
            </h2>

            <div className='space-y-4'>
              {/*//^ ------- LIGHT THEME --------  */}
              <label
                className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all duration-200
            ${theme === 'light'
                    ? theme === 'dark'
                      ? "bg-gray-700"
                      : "bg-gray-100"
                    : theme === 'dark'
                      ? "hover:bg-[#263640]"
                      : "hover:bg-gray-50"
                  }`}
              >
                <div className='flex items-center gap-3'>
                  <input
                    type='radio'
                    value='light'
                    checked={theme === 'light'}
                    onChange={() => setTheme('light')}
                    className='h-4 w-4 accent-green-500'
                  />
                  <span className='font-medium'>Light</span>
                </div>
              </label>

              {/*//^  -------- DARK THEME ---------  */}
              <label
                className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all duration-200
            ${theme === 'dark'
                    ? "bg-[#263640]"
                    : "hover:bg-gray-50"
                  }`}
              >
                <div className='flex items-center gap-3'>
                  <input
                    type='radio'
                    value='dark'
                    checked={theme === 'dark'}
                    onChange={() => setTheme('dark')}
                    className='h-4 w-4 accent-green-500'
                  />
                  <span className='font-medium'>Dark</span>
                </div>
              </label>
            </div>

            {/*//^  -------- CLOSE BUTTON --------  */}
            <button
              onClick={toggleThemeDialog}
              className={`mt-6 w-full py-2.5 rounded-xl font-semibold transition-all duration-200 cursor-pointer
          ${theme === 'dark'
                  ? "bg-green-600 hover:bg-green-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white"
                }`}
            >
              Close
            </button>
          </div>
        </div>
      )}


      {/*//^ -------- Status Preview Modal --------  */}
      {/* 
        - Opens only when isStatusPreviewOpen is true
        - Covers full screen with dark background
        - Displays the selected status content in center
      */}
      {isStatusPreviewOpen && (
        <div className='fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50'>
          {statusPreviewContent}
        </div>
      )}
    </div>
  )
}

export default Layout