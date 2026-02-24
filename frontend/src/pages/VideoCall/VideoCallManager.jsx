import React from 'react'
import useVideoCallStore from '../../stores/useVideoCallStore'
import useUserStore from '../../stores/useUserStore'
import { useEffect } from 'react'
import { useCallback } from 'react'
import VideoCallModal from './VideoCallModal'
import { toast } from 'react-toastify' //& Added for toast

function VideoCallManager({ socket }) {
    const { setCurrentCall, setIncomingCall, setCallType, setCallModalOpen, setCallStatus, setCallError, endCall } = useVideoCallStore()
    const { user } = useUserStore()

    //& [1]
    useEffect(() => {
        if (!socket) return

        //^ [1] Handle Incoming Call
        const handleIncomingCall = ({ callerId, callId, callerName, callerAvatar, callType }) => {
            console.log("📞 Incoming call received:", { callerId, callId, callerName, callType }) // Debug log
            setIncomingCall({
                callerId,
                callId,
                callerName,
                callerAvatar
            })

            setCallType(callType)
            setCallModalOpen(true)
            setCallStatus("ringing")
        }

        //^ [2] Handle Failed Call (offline or other reason)
        const handleCallFailed = ({ reason }) => {
            console.log("❌ Call failed:", reason)
            setCallStatus("failed")
            setCallError(reason || "Call failed")
            //& Show toast error
            toast.error(reason || "Call failed", {
                position: "top-center",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            })
            setTimeout(() => {
                endCall()
            }, 3000)
        }

        socket.on("incoming_call", handleIncomingCall)
        socket.on("call_failed", handleCallFailed)

        return() => {
            socket.off("incoming_call", handleIncomingCall)
            socket.off("call_failed", handleCallFailed)
        }
    }, [socket, setIncomingCall, setCallType, setCallModalOpen, setCallStatus, setCallError, endCall])


    //& [2] Memorized function to initiate call 
    const initiateCall = useCallback((receiverId, receiverName, receiverAvatar, callType="video") => {
        
        //* Create unique call ID (used to track this call)
        const callId = `${user?._id}-${receiverId}-${Date.now()}`

        const callData = {
            callId,
            participantId: receiverId,
            participantName: receiverName,
            participantAvatar: receiverAvatar
        }

        setCurrentCall(callData)
        setCallType(callType)
        setCallModalOpen(true)
        setCallStatus("calling")

        //* Emit the call initiate with retry if socket not connected
        const emitWithRetry = (retries = 3) => {
            if (socket && socket.connected) {
                socket.emit("initiate_call", {
                    callerId: user?._id,
                    receiverId,
                    callType,
                    callerInfo: {
                        username: user.username,
                        profilePicture: user.profilePicture
                    }
                })
            } else if (retries > 0) {
                console.warn(`Socket not connected, retrying... (${retries} left)`)
                setTimeout(() => emitWithRetry(retries - 1), 1000)
            } else {
                setCallError("Socket not connected. Please refresh.")
                toast.error("Socket not connected. Please refresh.")
                setTimeout(() => endCall(), 3000)
            }
        }

        emitWithRetry()
    }, [user, socket, setCurrentCall, setCallType, setCallModalOpen, setCallStatus, setCallError, endCall])


    //& [3] Expose the initiate call function to store
    useEffect(() => {
        useVideoCallStore.getState().initiateCall = initiateCall
    }, [initiateCall])


    return <VideoCallModal socket = {socket} />
}

export default VideoCallManager