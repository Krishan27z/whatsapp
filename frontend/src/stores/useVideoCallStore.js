import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"


const useVideoCallStore = create(
    subscribeWithSelector((set, get) => (
        {
            //& Call State
            currentCall: null,
            incomingCall: null,
            isCallActive: false,
            callType: null,  //~ Video & Audio

            //& Media State
            localStream: null,  //~ For the user who Starts Video call
            remoteStream: null, //~ For the Receiver whom the user calls
            isVideoEnabled: true,
            isAudioEnabled: true,

            //& webRTC
            peerConnection: null,
            iceCandidatesQueue: [], //~ Queue for ICE candidates

            //&
            isCallModalOpen: false,
            callStatus: "idle",   //~ Status can be -> idle/ calling/ ringing/ connecting/ connected/ ended
            callError: null,       //~ Error message for offline/failed calls (added for toast)


            //& Actions
            setCurrentCall: (call) => {
                set({ currentCall: call })
            },
            setIncomingCall: (call) => {
                set({ incomingCall: call })
            },
            setCallActive: (active) => {
                set({ isCallActive: active })
            },
            setCallType: (type) => {
                set({ callType: type })
            },
            setLocalStream: (stream) => {
                set({ localStream: stream })
            },
            setRemoteStream: (stream) => {
                set({ remoteStream: stream })
            },
            setPeerConnection: (pc) => {
                set({ peerConnection: pc })
            },
            setCallModalOpen: (open) => {
                set({ isCallModalOpen: open })
            },
            setCallStatus: (status) => {
                set({ callStatus: status })
            },
            setCallError: (error) => {   //& Added for toast
                set({ callError: error })
            },
            addIceCandidate: (candidate) => {
                const { iceCandidatesQueue } = get()  //*  Find who calls (means Caller)
                set({ iceCandidatesQueue: [...iceCandidatesQueue, candidate] }) //* Then set Caller & Receiver(candidate)
            },
            processQueuedIceCandidates: async () => {
                const { peerConnection, iceCandidatesQueue } = get()

                if (peerConnection && peerConnection.remoteDescription && iceCandidatesQueue.length > 0) {
                    // Fix: Local copy banano dorkar jate race condition na hoy
                    const candidatesToProcess = [...iceCandidatesQueue];
                    set({ iceCandidatesQueue: [] }); // Agei empty koro

                    for (const candidate of candidatesToProcess) {
                        try {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                        } catch (error) {
                            console.log("ICE candidate error", error)
                        }
                    }
                }
            },
            toggleVideo: () => {
                const { localStream, isVideoEnabled } = get()
                if (localStream) {
                    const videoTrack = localStream.getVideoTracks()[0]
                    if (videoTrack) {
                        videoTrack.enabled = !isVideoEnabled
                        set({ isVideoEnabled: !isVideoEnabled })
                    }
                }
            },
            toggleAudio: () => {
                const { localStream, isAudioEnabled } = get()
                if (localStream) {
                    const audioTrack = localStream.getAudioTracks()[0]
                    if (audioTrack) {
                        audioTrack.enabled = !isAudioEnabled
                        set({ isAudioEnabled: !isAudioEnabled })
                    }
                }
            },
            endCall: () => {
                const { localStream, peerConnection } = get()

                // 🔥 1. Stop all tracks properly
                if (localStream) {
                    localStream.getTracks().forEach((track) => track.stop())
                }

                // 🔥 2. Close PeerConnection and nullify listeners
                if (peerConnection) {
                    peerConnection.onicecandidate = null;
                    peerConnection.ontrack = null;
                    peerConnection.onconnectionstatechange = null;
                    peerConnection.oniceconnectionstatechange = null;
                    peerConnection.onsignalingstatechange = null;
                    peerConnection.close();
                }

                // 🔥 3. Reset everything to idle
                set({
                    currentCall: null,
                    incomingCall: null,
                    isCallActive: false,
                    callType: null,
                    localStream: null,
                    remoteStream: null,
                    isVideoEnabled: true,
                    isAudioEnabled: true,
                    peerConnection: null,
                    iceCandidatesQueue: [],
                    isCallModalOpen: false,
                    callStatus: "idle",
                    callError: null
                })
            },
            clearIncomingCall: () => {
                set({ incomingCall: null })
            }
        }
    ))
)

export default useVideoCallStore