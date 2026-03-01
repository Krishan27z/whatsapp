/**
 * ============================================================
 *! FILE PURPOSE:
 * This file handles all REAL-TIME VIDEO CALL events using Socket.IO.
 * 
 * It manages:
 * 1. Call start (initiate)
 * 2. Call accept / reject
 * 3. Call end
 * 4. WebRTC signaling (offer, answer, ICE candidates)
 * 
 * NOTE:
 * - Actual video/audio does NOT pass through server
 * - Server only helps users find each other & exchange signals
 * ============================================================
 */

const handleVideoCallEvent = (socket, io, userConnections) => {

    // ============================================================
    //! [1] INITIATE VIDEO / AUDIO CALL
    // Caller sends request to receiver
    // ============================================================
    socket.on("initiate_call", ({ callerId, receiverId, callType, callerInfo }) => {
        const receiverSockets = userConnections.get(receiverId);

        if (receiverSockets && receiverSockets.size > 0) {
            const callId = `${callerId}-${receiverId}-${Date.now()}`;

            // Correct Logic: Send to ALL sockets of the receiver
            receiverSockets.forEach(socketId => {
                io.to(socketId).emit("incoming_call", {
                    callerId,
                    callerName: callerInfo.username,
                    callerAvatar: callerInfo.profilePicture,
                    callId,
                    callType
                });
            });
        } else {
            socket.emit("call_failed", { reason: "User is offline" });
        }
    })

    // ============================================================
    //! [2] ACCEPT CALL
    // Receiver accepts call and informs caller
    // ============================================================
    socket.on("accept_call", ({ callerId, callId, receiverInfo }) => {

        // Get caller socket id
        const callerSockets = userConnections.get(callerId)
        const callerSocketId = callerSockets
            ? [...callerSockets][0]
            : null

        if (callerSocketId) {
            // Inform CALLER that call is accepted
            io.to(callerSocketId).emit("call_accepted", {
                receiverName: receiverInfo.username,
                receiverAvatar: receiverInfo.profilePicture,
                callId
            })
        } else {
            console.log(`server: Caller ${callerId} not online`)
        }
    })

    // ============================================================
    //! [3] REJECT CALL
    // Receiver rejects the call
    // ============================================================
    socket.on("reject_call", ({ callerId, callId }) => {

        const callerSockets = userConnections.get(callerId)
        const callerSocketId = callerSockets
            ? [...callerSockets][0]
            : null

        if (callerSocketId) {
            io.to(callerSocketId).emit("call_rejected", { callId })
        }
    })


    // ============================================================
    //! [4] END CALL
    // Either caller or receiver ends the call
    // ============================================================
    socket.on("end_call", ({ participantId, callId }) => {

        const participantSockets = userConnections.get(participantId)
        const participantSocketId = participantSockets
            ? [...participantSockets][0]
            : null

        if (participantSocketId) {
            io.to(participantSocketId).emit("call_ended", { callId })
        }
    })


    // ============================================================
    //! [5] WEBRTC OFFER
    // ============================================================
    /**
     * WHAT IS WEBRTC?
     * WebRTC allows 2 browsers to directly share:
     * - Video
     * - Audio
     * - Screen
     * 
     * Server does NOT handle media.
     * Server only passes messages (signals).
     * 
     * OFFER:
     * Caller creates an OFFER describing:
     * - video codecs
     * - audio codecs
     * - connection info
     * 
     * This offer is sent to receiver using socket
     */
    socket.on("webrtc_offer", ({ offer, receiverId, callId, senderId  }) => {

        const receiverSockets = userConnections.get(receiverId)
        const receiverSocketId = receiverSockets
            ? [...receiverSockets][0]
            : null

        if (receiverSocketId) {
            io.to(receiverSocketId).emit("webrtc_offer", {
                offer,       // SDP offer
                senderId,   // ← use client-provided senderId
                callId
            })
            console.log(`server: offer sent to ${receiverId}`)
        } else {
            console.log(`server: Receiver ${receiverId} not found for offer`)
        }
    })


    // ============================================================
    // ![6] WEBRTC ANSWER
    // ============================================================
    /**
     * ANSWER:
     * Receiver replies with ANSWER after accepting OFFER
     * This completes basic connection setup
     */
    socket.on("webrtc_answer", ({ answer, receiverId, callId, senderId  }) => {

        const receiverSockets = userConnections.get(receiverId)
        const receiverSocketId = receiverSockets
            ? [...receiverSockets][0]
            : null

        if (receiverSocketId) {
            io.to(receiverSocketId).emit("webrtc_answer", {
                answer,                // SDP answer
                senderId,  // ← use client-provided senderId
                callId
            })
            console.log(`server: answer sent to ${receiverId}`)
        } else {
            console.log(`server: Receiver ${receiverId} not found for answer`)
        }
    })


    // ============================================================
    //! [7] WEBRTC ICE CANDIDATE
    // ============================================================
    /**
     * ICE CANDIDATE (VERY IMPORTANT):
     * 
     * ICE helps browsers to find BEST PATH to connect.
     * Example paths:
     * - WiFi
     * - Mobile network
     * - Public IP
     * - NAT / Firewall routes
     * 
     * Browsers keep discovering network routes and send them as ICE candidates.
     * 
     * Server only FORWARDS these candidates.
     */
    socket.on("webrtc_ice_candidate", ({ candidate, receiverId, callId, senderId  }) => {

        const receiverSockets = userConnections.get(receiverId)
        const receiverSocketId = receiverSockets
            ? [...receiverSockets][0]
            : null

        if (receiverSocketId) {
            io.to(receiverSocketId).emit("webrtc_ice_candidate", {
                candidate,             // network route info
                senderId,  // ← use client-provided senderId
                callId
            })
        } else {
            console.log(`server: Receiver ${receiverId} not found for ICE`)
        }
    })
}

export default handleVideoCallEvent