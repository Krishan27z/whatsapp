import React, { useState } from 'react'
import { toast } from 'react-toastify'
import useThemeStore from "../../stores/useThemeStore"
import { logOutUser } from '../../services/user.service'
import useUserStore from "../../stores/useUserStore"
import Layout from "../../components/Layout"
import { FaComment, FaMoon, FaQuestionCircle, FaSearch, FaSignInAlt, FaSun, FaUser } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'


function Setting() {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")


  const { theme } = useThemeStore()
  const { user, clearUser } = useUserStore()

  const toggleThemeDialog = () => {
    setIsThemeDialogOpen(!isThemeDialogOpen)
  }

  const handleLogout = async () => {
    try {
      await logOutUser()
      clearUser()
      toast.success("User Logout Successfully")
    } catch (error) {
      toast.error("Failed to logout", error)
    }
  }


  const menuItems = [
    { icon: FaUser, lable: "Account", href: "/user-profile" },
    { icon: FaComment, lable: "Chats", href: "/" },
    { icon: FaQuestionCircle, lable: "Help", href: "/help" },
    { icon: FaMoon, lable: "Theme", action: toggleThemeDialog }
  ]

  const filteredItems = menuItems.filter(item =>
    item.lable.toLowerCase().includes(searchTerm.toLowerCase())
  )


  return (
    <Layout
      isThemeDialogOpen={isThemeDialogOpen}
      toggleThemeDialog={toggleThemeDialog}
    >
      <div
        className={`w-full md:w-[360px] max-w-full md:max-w-[360px] min-w-0 md:min-w-[360px] h-screen 
            flex flex-col relative border-r
            ${theme === 'dark'
            ? "border-gray-600 bg-[rgb(17,27,33)]"
            : "border-gray-200 bg-white"}`}
      >

        {/*//& ------ Main Container with Border ------ */}
        <div
          className={`flex-1 flex flex-col ${theme === 'dark' ? "border-gray-600" : "border-gray-200"}`}
        >
          {/*//& ------ FIXED Header Section (WP STYLE) ------ */}
          <div
            className={`fixed top-0 z-50 w-full md:w-[360px] border-r
                ${theme === 'dark'
                ? "border-gray-600 bg-[rgb(17,27,33)]"
                : "border-gray-200 bg-white"}`}
          >
            {/*//* ------ Header ------ */}
            <div
              className={`p-4 flex justify-between items-center 
                ${theme === 'dark' ? "text-white" : "text-gray-800"}`}
            >
              <h2 className="text-xl font-semibold">Settings</h2>
            </div>

            {/*//* ------- Search Bar -------- */}
            <div className='relative px-1 pb-4'>
              <FaSearch className={`absolute left-6 top-6 transform -translate-y-1/2 
                    ${theme === 'dark' ? "text-gray-300" : "text-gray-800"}`}
              />
              <input
                type='text'
                placeholder='Search Settings'
                value={searchTerm}
                className={`w-full pl-12 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500
                    ${theme === 'dark'
                    ? "bg-gray-800 text-white border-gray-700 placeholder-gray-300"
                    : "bg-gray-100 text-black border-gray-100 placeholder-gray-700"
                  }`}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/*//&  ------- Scrollable Content -------  */}
          <div className='flex-1 overflow-y-auto no-scrollbar px-1 pt-[132px]'>
            {/*//& ----- Profile Section ------  */}
            <div
              className={`flex items-center gap-4 px-2 py-4 rounded-xl mb-4 mx-1 cursor-pointer transition-colors duration-200
                 ${theme === 'dark'
                  ? "bg-gradient-to-r from-[#283741] via-[#2c3a42] to-[#202c35] hover:from-[#26323b] hover:via-[#2a3942] hover:to-[#26323b]"
                  : "bg-gradient-to-r from-green-100 via-gray-50 to-cyan-50 hover:via-[#eef0f2] border border-gray-100"
                }`}
            >
              {/*//* Avatar */}
              <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-gray-200">
                <img
                  src={user?.profilePicture}
                  alt={user?.username}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${user?.username}&background=random`;
                  }}
                />
              </div>

              {/*//* Text */}
              <div className="min-w-0 flex-1">
                <h2
                  className={`font-semibold truncate ${theme === 'dark' ? "text-white" : "text-gray-900"}`}
                >
                  {user.username}
                </h2>

                <p
                  className={`text-sm truncate ${theme === 'dark' ? "text-gray-400" : "text-gray-600"}`}
                >
                  {user.about || "Hey there! I am using WhatsApp"}
                </p>
              </div>
            </div>

            {/*//&  ------- Menu Items -------  */}
            <div className='space-y-1'>
              <AnimatePresence>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item, index) => (
                    <motion.div
                      key={item.lable} // stable key
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{
                        duration: 0.3,
                        delay: index * 0.03
                      }}
                    >
                      {item.href ? (
                        <Link
                          to={item.href}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded
                              ${theme === 'dark'
                              ? "text-white hover:bg-[#202c33]"
                              : "text-black hover:bg-gray-100"
                            }`}
                        >
                          <item.icon className={`h-5 w-5 ${theme === 'dark' ? "text-gray-500" : "text-gray-600"}`} />
                          <div
                            className={`border-b w-full p-3 
                                ${theme === 'dark'
                                ? "border-gray-700"
                                : "border-gray-200"
                              }`}
                          >
                            {item.lable}
                          </div>
                        </Link>
                      ) : (
                        <button
                          onClick={item.action}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded cursor-pointer
                              ${theme === 'dark'
                              ? "text-white hover:bg-[#202c33]"
                              : "text-gray-800 hover:bg-gray-100"
                            }`}
                        >

                          {/*//^ =======  Theme Icon =======  */}
                          <div className="flex items-center gap-2 flex-1">
                            {theme === 'dark' ? (
                              <FaMoon className='h-5 w-5 text-gray-500' />
                            ) : (
                              <FaSun className='h-5 w-5 text-gray-600' />
                            )}
                            <div
                              className={`border-b flex-1 p-3 text-left
                                ${theme === 'dark' ? "border-gray-700" : "border-gray-200"}`}
                            >
                              Theme
                            </div>
                          </div>
                          <span className={`text-sm ${theme === 'dark' ? "text-gray-400" : "text-gray-500"}`}>
                            {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </span>
                        </button>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className='text-center text-sm text-gray-400 mt-6'
                  >
                    No settings found
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/*//&  ------ Logout Button ------  */}
            <div className="py-4">
              <button
                onClick={handleLogout}
                className={`w-full flex items-center gap-3 p-3 mt-18 md:mt-20 rounded text-red-500 font-semibold 
                  ${theme === 'dark' ? "hover:bg-[#202c33]" : "hover:bg-gray-100"} cursor-pointer`}
              >
                <FaSignInAlt className='h-5 w-5' />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

    </Layout>
  )
}

export default Setting