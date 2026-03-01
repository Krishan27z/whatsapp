import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import useVideoCallStore from '../../stores/useVideoCallStore'
import useUserStore from '../../stores/useUserStore'
import useThemeStore from '../../stores/useThemeStore'
import { FaMicrophone, FaMicrophoneSlash, FaPhoneSlash, FaTimes, FaVideo, FaVideoSlash, FaExclamationCircle } from 'react-icons/fa'

function VideoCallModal({ socket }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const toastTimeoutRef = useRef(null)
  const listenersAttachedRef = useRef(false) // Prevent duplicate listener registration
  const socketRef = useRef(socket) // Store socket in ref to keep it stable

  //& Refs to store latest values for socket handlers (to avoid stale closures)
  const currentCallRef = useRef(null)
  const incomingCallRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const callTypeRef = useRef(null)
  const userRef = useRef(null)
  const setRemoteStreamRef = useRef(null)
  const setCallStatusRef = useRef(null)
  const setCallActiveRef = useRef(null)
  const addIceCandidateRef = useRef(null)
  const processQueuedIceCandidatesRef = useRef(null)
  const endCallRef = useRef(null)
  const queuedOfferRef = useRef(null)
  const isEndingRef = useRef(false); // 🔥 IMPORTANT: Add a ref to track if cleanup is in progress

  const { currentCall, incomingCall, isCallActive, callType, localStream, remoteStream, isVideoEnabled, isAudioEnabled,
    peerConnection, iceCandidatesQueue, isCallModalOpen, callStatus, callError, setCurrentCall, setIncomingCall, setCallActive, setCallType,
    setLocalStream, setRemoteStream, setPeerConnection, setCallModalOpen, setCallStatus, setCallError, addIceCandidate,
    processQueuedIceCandidates, toggleVideo, toggleAudio, endCall, clearIncomingCall } = useVideoCallStore()

  const { user } = useUserStore()
  const { theme } = useThemeStore()

  //& Update refs when state changes
  useEffect(() => {
    currentCallRef.current = currentCall
    incomingCallRef.current = incomingCall
    peerConnectionRef.current = peerConnection
    localStreamRef.current = localStream
    remoteStreamRef.current = remoteStream
    callTypeRef.current = callType
    userRef.current = user
    setRemoteStreamRef.current = setRemoteStream
    setCallStatusRef.current = setCallStatus
    setCallActiveRef.current = setCallActive
    addIceCandidateRef.current = addIceCandidate
    processQueuedIceCandidatesRef.current = processQueuedIceCandidates
    endCallRef.current = endCall
  }, [currentCall, incomingCall, peerConnection, localStream, remoteStream, callType, user, setRemoteStream, setCallStatus, setCallActive, addIceCandidate, processQueuedIceCandidates, endCall])

  //& Update socket ref when prop changes (rare, but safe)
  useEffect(() => {
    socketRef.current = socket
  }, [socket])

  //& Local state for toast visibility (to auto-hide)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  //& Show toast when callError changes
  useEffect(() => {
    if (callError) {
      setToastMessage(callError)
      setShowToast(true)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = setTimeout(() => {
        setShowToast(false)
        setCallError(null)
      }, 3000)
    }
  }, [callError, setCallError])

  //&  STUN servers
  const rtcConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  }

  //&  Memorize display the user info
  const displayInfo = useMemo(() => {
    if (incomingCall && incomingCall.callerName) {
      return { name: incomingCall.callerName, avatar: incomingCall.callerAvatar }
    }
    if (currentCall && currentCall.participantName) {
      return { name: currentCall.participantName, avatar: currentCall.participantAvatar }
    }
    return null
  }, [incomingCall, currentCall])

  //&  Connection Detection
  useEffect(() => {
    if (peerConnection && remoteStream) {
      setCallStatus("connected")
      setCallActive(true)
    }
  }, [peerConnection, remoteStream, setCallStatus, setCallActive])


  //&  Setup local video stream when local stream changes
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    } else if (localStream && !localVideoRef.current) {
      const timer = setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [localStream])

  //& Setup remote video stream when remote stream changes
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
    } else if (remoteStream && !remoteVideoRef.current) {
      const timer = setTimeout(() => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [remoteStream])

  //& Initialize Media Stream with better error handling
  const initializeMedia = async (video = true) => {
    try {
      // Step 1: Use minimal constraints first – mobile friendly
      const constraints = {
        audio: true,
        video: video ? { facingMode: "user" } : false // just user-facing camera, no hardcoded resolution
      };

      // Step 2: Try to get the stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error("❌ Media Error:", error.name, error.message);

      // Step 3: If video failed but we wanted video, try audio-only as fallback
      if (video && error.name !== 'NotAllowedError' && error.name !== 'PermissionDeniedError') {
        console.log("🎤 Video failed, trying audio-only...");
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setLocalStream(audioStream);
          // Update callType to audio in store so UI adjusts
          setCallType('audio');
          return audioStream;
        } catch (audioError) {
          console.error("❌ Audio-only also failed:", audioError);
        }
      }

      // Step 4: Human readable error messages
      let message = 'Failed to access camera/microphone.';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Camera/Microphone access denied. Please allow permissions in browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message = 'No camera or microphone found on this device.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        message = 'Camera or microphone is already in use by another app.';
      } else if (error.name === 'OverconstrainedError') {
        message = 'Camera cannot satisfy the requested constraints. Trying without specific resolution...';
        // Fallback: try with simplest constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          setLocalStream(fallbackStream);
          return fallbackStream;
        } catch (fallbackError) {
          message = 'Still failed. Please check permissions.';
        }
      } else if (error.message.includes('Requested device not found')) {
        message = 'No camera/microphone detected.';
      }

      throw new Error(message);
    }
  }

  //& Create Peer Connection
  const createPeerConnection = (stream, role) => {
    const pc = new RTCPeerConnection(rtcConfiguration)

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        const participantId = currentCallRef.current?.participantId || incomingCallRef.current?.callerId
        const callId = currentCallRef.current?.callId || incomingCallRef.current?.callId
        if (participantId && callId) {
          socketRef.current.emit("webrtc_ice_candidate", {
            candidate: event.candidate,
            receiverId: participantId,
            callId: callId,
            senderId: userRef.current?._id   // ← explicit senderId
          })
        }
      }
    }

    pc.ontrack = (event) => {
      const currentStream = remoteStreamRef.current || new MediaStream();
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          if (!currentStream.getTracks().find(t => t.id === track.id)) {
            currentStream.addTrack(track);
          }
        });
      } else {
        currentStream.addTrack(event.track);
      }
      setRemoteStream(currentStream);
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatusRef.current?.("connected")
        setCallActiveRef.current?.(true)
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallStatusRef.current?.("failed")
        setCallError("Connection lost")
        setTimeout(() => endCallRef.current?.(), 2000)
      }
    }

    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })
    }

    setPeerConnection(pc)
    return pc
  }

  //& Initialize call after acceptance (caller side)
  const initializeCallerCall = useCallback(async () => {
    try {
      setCallStatus("connecting")
      const currentCallVal = currentCallRef.current
      const callTypeVal = callTypeRef.current
      if (!currentCallVal) return

      const stream = await initializeMedia(callTypeVal === 'video')
      const pc = createPeerConnection(stream, "CALLER")

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callTypeVal === 'video' })
      await pc.setLocalDescription(offer)

      socketRef.current.emit("webrtc_offer", {
        offer,
        receiverId: currentCallVal.participantId,
        callId: currentCallVal.callId,
        senderId: userRef.current?._id   // ← explicit senderId
      })
    } catch (error) {
      setCallStatus("failed")
      setCallError(error.message || "Failed to start call")
      setTimeout(() => endCall(), 2000)
    }
  }, [])


  //& WebRTC Offer Handler
  const handleWebRTCOffer = async ({ offer, senderId, callId }) => {
    const pc = peerConnectionRef.current;
    if (!pc) {
      queuedOfferRef.current = { offer, senderId, callId };
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      if (processQueuedIceCandidatesRef.current) await processQueuedIceCandidatesRef.current();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("webrtc_answer", { answer, receiverId: senderId, callId });
    } catch (error) {
      console.error("Offer Error:", error);
    }
  }

  //& WebRTC Answer Handler
  const handleWebRTCAnswer = async ({ answer, senderId, callId }) => {
    const pc = peerConnectionRef.current;
    if (!pc || pc.signalingState === 'closed') return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      if (processQueuedIceCandidatesRef.current) await processQueuedIceCandidatesRef.current();
    } catch (error) {
      console.error("Answer Error:", error);
    }
  }

  //& WebRTC Candidates Handler
  const handleWebRTCCandidates = async ({ candidate }) => {
    const pc = peerConnectionRef.current
    if (pc && pc.signalingState !== 'closed') {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (e) { }
      } else {
        addIceCandidate(candidate)
      }
    }
  }


  //& Receiver: Answer Call
  const handleAnswerCall = async () => {
    try {
      setCallStatus("connecting");

      // 🚫 DO NOT call checkPermissions() here – it breaks mobile activation
      const stream = await initializeMedia(callType === 'video');  // Direct call to initializeMedia with correct video flag
      const pc = createPeerConnection(stream, "RECEIVER");

      if (queuedOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(queuedOfferRef.current.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit("webrtc_answer", {
          answer,
          receiverId: queuedOfferRef.current.senderId,
          callId: queuedOfferRef.current.callId,
          senderId: userRef.current?._id   // ← explicit senderId
        });
        queuedOfferRef.current = null;
      }

      socketRef.current.emit("accept_call", {
        callerId: incomingCall?.callerId,
        callId: incomingCall?.callId,
        receiverInfo: { username: user?.username, profilePicture: user?.profilePicture }
      });

      setCurrentCall({
        callId: incomingCall?.callId,
        participantId: incomingCall?.callerId,
        participantName: incomingCall?.callerName,
        participantAvatar: incomingCall?.callerAvatar
      });
      clearIncomingCall();
    } catch (error) {
      setCallError(error.message || "Failed to answer call");
      setTimeout(() => endCall(), 2000);
    }
  };

  //& Receiver: Reject Call
  const handleRejectCall = useCallback(() => {
    const callerId = incomingCallRef.current?.callerId;
    const callId = incomingCallRef.current?.callId;

    if (callerId && callId && socketRef.current) {
      socketRef.current.emit("reject_call", { callerId, callId });
    }
    endCall();
  }, [endCall])

  //& End Call
  const handleEndCall = useCallback(() => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    const pId = currentCallRef.current?.participantId || incomingCallRef.current?.callerId;
    const cId = currentCallRef.current?.callId || incomingCallRef.current?.callId;

    if (pId && cId && socketRef.current) {
      console.log("🚀 Emitting end_call to:", pId);
      socketRef.current.emit("end_call", { callId: cId, participantId: pId });
    }

    endCall();
    isEndingRef.current = false;
  }, [endCall])

  //& 🔥 REAL-TIME SOCKET LISTENERS (Fixed Stale Closures)
  useEffect(() => {
    const currentSocket = socketRef.current;
    if (!currentSocket) return;

    const onCallAccepted = (data) => {
      console.log("✅ Call Accepted by receiver");
      setCallStatus("connecting");
      // Give a tiny delay for the receiver to set up their PC
      setTimeout(() => initializeCallerCall(), 300);
    };

    const onCallRejected = () => {
      console.log("❌ Call Rejected by other end");
      setCallStatus("rejected");
      setCallError("Call Rejected");
      setTimeout(() => endCall(), 1500);
    };

    const onCallEnded = () => {
      console.log("📵 Call Ended by other end");
      setCallStatus("ended");
      endCall(); // Sync both sides instantly
    };

    const onWebRTCOffer = (data) => handleWebRTCOffer(data);
    const onWebRTCAnswer = (data) => handleWebRTCAnswer(data);
    const onWebRTCCandidate = (data) => handleWebRTCCandidates(data);

    // Attach Listeners
    currentSocket.on("call_accepted", onCallAccepted);
    currentSocket.on("call_rejected", onCallRejected);
    currentSocket.on("call_ended", onCallEnded);
    currentSocket.on("webrtc_offer", onWebRTCOffer);
    currentSocket.on("webrtc_answer", onWebRTCAnswer);
    currentSocket.on("webrtc_ice_candidate", onWebRTCCandidate);

    return () => {
      currentSocket.off("call_accepted", onCallAccepted);
      currentSocket.off("call_rejected", onCallRejected);
      currentSocket.off("call_ended", onCallEnded);
      currentSocket.off("webrtc_offer", onWebRTCOffer);
      currentSocket.off("webrtc_answer", onWebRTCAnswer);
      currentSocket.off("webrtc_ice_candidate", onWebRTCCandidate);
    };
  }, [initializeCallerCall, endCall]); //~ endCall and initializeMedia depend on store actions


  const shouldShowActiveCall = isCallActive || ['calling', 'connecting', 'connected', 'rejected', 'failed'].includes(callStatus)

  if (!isCallModalOpen && !incomingCall) return null

  //& --- FULL ORIGINAL UI START ---
  return (
    <div className='fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-[9999]'>
      {showToast && (
        <div className='absolute top-4 left-1/2 transform -translate-x-1/2 z-[10000] bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2'>
          <FaExclamationCircle />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className={`relative w-full h-full max-w-4xl max-h-3xl rounded-lg overflow-hidden
        ${theme === 'dark' ? "bg-gray-900" : "bg-white"}`}
      >
        {incomingCall && !isCallActive && (
          <div className='flex flex-col items-center justify-center h-full p-8'>
            <div className='text-center mb-8'>
              <div className='w-32 h-32 rounded-full bg-gray-300 mx-auto mb-4 overflow-hidden'>
                {displayInfo?.avatar ? (
                  <img
                    src={displayInfo.avatar}
                    alt={displayInfo.name}
                    className='w-full h-full object-cover'
                    onError={(e) => { e.target.src = '/placeholder.svg' }}
                  />
                ) : (
                  <div className='w-full h-full bg-gray-400 flex items-center justify-center text-white text-4xl'>
                    {displayInfo?.name?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <h2 className={`text-2xl font-semibold mb-2 
                ${theme === 'dark' ? "text-white" : "text-gray-900"}`}>
                {displayInfo?.name || 'Unknown'}
              </h2>
              <p className={`text-lg ${theme === 'dark' ? "text-gray-300" : "text-gray-600"}`}>
                Incoming {callType} call...
              </p>
            </div>

            <div className='flex space-x-6'>
              <button
                onClick={handleRejectCall}
                className='w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full 
                  flex items-center justify-center text-white transition-colors'>
                <FaPhoneSlash className='w-6 h-6' />
              </button>
              <button
                onClick={handleAnswerCall}
                className='w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full 
                  flex items-center justify-center text-white transition-colors'>
                <FaVideo className='w-6 h-6' />
              </button>
            </div>
          </div>
        )}

        {shouldShowActiveCall && (
          <div className='w-full h-full relative'>
            {callType === 'video' && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className='w-full h-full object-cover bg-gray-800'
              />
            )}

            {(callType !== 'video' || !remoteStream || callStatus === 'rejected' || callStatus === 'failed') && (
              <div className='absolute inset-0 bg-gray-800 flex items-center justify-center'>
                <div className='text-center'>
                  <div className='w-32 h-32 rounded-full bg-gray-600 mx-auto mb-4 overflow-hidden'>
                    {displayInfo?.avatar ? (
                      <img
                        src={displayInfo.avatar}
                        alt={displayInfo.name}
                        className='w-full h-full object-cover'
                        onError={(e) => { e.target.src = '/placeholder.svg' }}
                      />
                    ) : (
                      <div className='w-full h-full bg-gray-500 flex items-center justify-center text-white text-4xl'>
                        {displayInfo?.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <p className='text-xl text-white'>
                    {callStatus === 'calling'
                      ? `Calling ${displayInfo?.name || '...'}...`
                      : callStatus === 'connecting'
                        ? "Connecting..."
                        : callStatus === 'connected'
                          ? displayInfo?.name || 'Connected'
                          : callStatus === 'rejected'
                            ? "Call Rejected"
                            : callStatus === 'failed'
                              ? "Connection Failed"
                              : displayInfo?.name || 'Call'
                    }
                  </p>
                </div>
              </div>
            )}

            {callType === 'video' && localStream && callStatus !== 'rejected' && callStatus !== 'failed' && (
              <div className='absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-white'>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className='w-full h-full object-cover'
                />
              </div>
            )}

            {callStatus !== 'rejected' && callStatus !== 'failed' && (
              <div className='absolute top-4 left-4'>
                <div className={`px-4 py-2 rounded-full bg-opacity-75 ${theme === 'dark' ? "bg-gray-800" : "bg-white"}`}>
                  <p className={`text-sm ${theme === 'dark' ? "text-white" : "text-gray-900"}`}>
                    {callStatus === 'connected' ? "Connected" : callStatus.charAt(0).toUpperCase() + callStatus.slice(1)}
                  </p>
                </div>
              </div>
            )}

            {callStatus !== 'rejected' && callStatus !== 'failed' && (
              <div className='absolute bottom-8 left-1/2 transform -translate-x-1/2'>
                <div className='flex space-x-4'>
                  {callType === 'video' && (
                    <button
                      onClick={toggleVideo}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
                    ${isVideoEnabled
                          ? "bg-gray-600 hover:bg-gray-700 text-white"
                          : "bg-red-500 hover:bg-red-600 text-white"
                        }`}
                    >
                      {isVideoEnabled ? <FaVideo className='w-6 h-6' /> : <FaVideoSlash className='w-6 h-6' />}
                    </button>
                  )}

                  <button
                    onClick={toggleAudio}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
                    ${isAudioEnabled
                        ? "bg-gray-600 hover:bg-gray-700 text-white"
                        : "bg-red-500 hover:bg-red-600 text-white"
                      }`}
                  >
                    {isAudioEnabled ? <FaMicrophone className='w-6 h-6' /> : <FaMicrophoneSlash className='w-6 h-6' />}
                  </button>

                  <button
                    onClick={handleEndCall}
                    className='w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full 
                    flex items-center justify-center text-white transition-colors'>
                    <FaPhoneSlash className='w-6 h-6' />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {callStatus === 'calling' && (
          <button
            onClick={handleEndCall}
            className='absolute top-4 right-4 w-12 h-12 bg-gray-600 hover:bg-gray-700 rounded-full 
                  flex items-center justify-center text-white transition-colors'>
            <FaTimes className='w-5 h-5' />
          </button>
        )}
      </div>
    </div>
  )
}

export default VideoCallModal;