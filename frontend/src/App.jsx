import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './pages/UserLogin/Login.jsx'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { PublicRoute, ProtectedRoute } from './protectedRoute/Protected'
import HomePage from './components/HomePage.jsx'
import UserDetails from './components/UserDetails.jsx'
import Status from './pages/StatusSection/Status.jsx'
import Setting from './pages/SettingSection/Setting.jsx'
import useUserStore from './stores/useUserStore.js'
import { initializeSocket, disconnectSocket, getSocket } from './services/chat.service.js'
import { useChatStore } from './stores/useChatStore.js'
import useStatusStore from "./stores/useStatusStore"
import Help from './pages/HelpSection/Help.jsx'

// 🔥 VIDEO CALL GLOBAL LOGIC IMPORTS
import VideoCallModal from './pages/VideoCall/VideoCallModal.jsx'
import useVideoCallStore from './stores/useVideoCallStore.js'

export default function App() {
  const { user } = useUserStore() //& Get the currently logged-in user from auth store (Zustand)

  //& Chat-related actions from chat store (Zustand)
  //? setCurrentUser      → saves logged-in user for chat logic
  //? initsocketListeners → binds all socket.io listeners (receive msg, typing, status etc.)
  //? cleanUp             → clears chat state on logout/unmount
  const { setCurrentUser, initSocketListeners, cleanUp } = useChatStore()

  // 🔥 Video Call Store actions to trigger the modal globally
  const { setIncomingCall, setCallModalOpen, setCallType } = useVideoCallStore()
  const [globalSocket, setGlobalSocket] = useState(null)


  //! This effect manages the "ENTIRE socket lifecycle"
  //^ Runs when user logs in / logs out/ any dependency reference changes
  useEffect(() => {
    if (user?._id) {    //& Only initialize socket if user exists and is authenticated
      console.log("🚀 App: User found, initializing socket...", user._id);

      //& ✅ Step 1: First set current user in chat store
      setCurrentUser(user);

      //& ✅ Step 2: Then initialize socket connection and listeners
      const setupSocket = async () => {
        try {
          console.log("⏳ Waiting for socket connection...");

          const socket = await initializeSocket();
          setGlobalSocket(socket); // Save socket for Global Modal

          console.log("✅ Socket fully connected:", socket.id);

          //^ 🔥 Attach listeners ONLY AFTER socket is ready
          initSocketListeners();
          useStatusStore.getState().initializeSocket();

          //^ 📞 GLOBAL VIDEO CALL LISTENER (Added for Global Access)
          //? This allows the receiver to get calls even if they are in Settings or Profile
          socket.on("incoming_call", (data) => {
            console.log("📞 Global App: Incoming call received", data);
            setIncomingCall(data);      // Save caller details to store
            setCallType(data.callType); // Set if it's video/audio
            setCallModalOpen(true);     // 🔥 TRIGGER MODAL GLOBALLY
          });

          console.log("✅ Socket listeners attached");

          //^ 🔁 Handle reconnects
          socket.on("reconnect", () => {
            console.log("🔄 Reconnected - reattaching listeners");
            initSocketListeners();
            useStatusStore.getState().initializeSocket();
          });

        } catch (err) {
          console.error("❌ Socket setup failed:", err);
        }
      };

      setupSocket()

      //^ It runs when:
      //? (1) user logs out, or (2) App component unmounts, or (3) effect re-runs due to dependency change
      return () => {
        const socket = getSocket();
        if (socket) {
          socket.off("incoming_call"); // Remove global call listener
        }
        cleanUp()  //^ Clear all chat-related Zustand state
        //? conversations, messages, online users, typing users, etc.
        disconnectSocket()  //^ Properly disconnect socket from backend
        //? Triggers backend "disconnect" event
        useStatusStore.getState().cleanupSocket(); // cleanup status store
      }
    }
  }, [user])  //& Dependency on user means this effect runs whenever user logs in or out

  return (
    <>
      <ToastContainer position='top-right' autoClose={3000} />  {/*//& Toast container to show popup notifications */}
      
      {/*//! 📞 GLOBAL MODAL: Always mounted to listen for calls across all routes */}
      {globalSocket && <VideoCallModal socket={globalSocket} />}

      <Router>
        <Routes>
          {/*//! ================= PUBLIC ROUTES ================= */}
          {/*//~ These routes are accessible ONLY when user is NOT logged in */}
          <Route element={<PublicRoute />}>
            <Route path='/user-login' element={<Login />} /> {/* //&  <Login /> component is rendered when this route matches (URL = /user-login ) */}
          </Route>

          {/*//! ================= PROTECTED ROUTES ================= */}
          {/*//~ These routes are accessible ONLY when user IS logged in */}
          <Route element={<ProtectedRoute />}>
            <Route path='/' element={<HomePage />} />   {/* //&  <HomePage/> component is rendered when this route matches [When URL = /] */}
            <Route path='/user-profile' element={<UserDetails />} /> {/* //&  <UserDetails/> component is rendered when this route matches [When URL = /user-profile] */}
            <Route path='/status' element={<Status />} />    {/* //&  <Status/> component is rendered when this route matches [When URL = /status] */}
            <Route path='/setting' element={<Setting />} />  {/* //&  <Setting/> component is rendered when this route matches [When URL = /setting] */}
            <Route path='/help' element={<Help />} /> {/* //?  <Help/> component is rendered when this route matches [When URL = /help] */}
          </Route>
        </Routes>
      </Router>
    </>
  )
}