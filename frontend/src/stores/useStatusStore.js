import { create } from "zustand";
import { getSocket } from "../services/chat.service";
import axiosInstance from "../services/url.service";
import useUserStore from "./useUserStore";

const useStatusStore = create((set, get) => ({
    statuses: [],
    loading: false,
    error: null,
    lastStatusTabVisit: null,

    realTimeStatuses: new Map(),
    statusViewersMap: new Map(),
    statusReactionsMap: new Map(),
    activeStatusUpdates: new Set(),
    expiredStatuses: new Set(),
    optimisticViewed: new Set(),
    isStatusTabActive: false,
    statusUpdateCounter: 0,

    // 🔥 NEW: Track unseen status IDs (only cleared when Status tab is clicked)
    unseenStatusIds: new Set(),

    setStatuses: (statuses) => set({ statuses }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setStatusTabActive: (active) => set({ isStatusTabActive: active }),
    updateLastStatusTabVisit: () => set({ lastStatusTabVisit: Date.now() }),

    // 🔥 NEW: Actions for unseen statuses
    addUnseenStatus: (statusId) => {
        set((state) => ({
            unseenStatusIds: new Set(state.unseenStatusIds).add(statusId),
            statusUpdateCounter: state.statusUpdateCounter + 1,
        }));
        console.log("✅ Added to unseen:", statusId);
    },
    removeUnseenStatus: (statusId) => {
        set((state) => {
            const newSet = new Set(state.unseenStatusIds);
            newSet.delete(statusId);
            return {
                unseenStatusIds: newSet,
                statusUpdateCounter: state.statusUpdateCounter + 1,
            };
        });
        console.log("❌ Removed from unseen:", statusId);
    },
    clearUnseenStatuses: () => {
        set((state) => ({
            unseenStatusIds: new Set(),
            statusUpdateCounter: state.statusUpdateCounter + 1,
        }));
        console.log("🧹 Cleared all unseen");
    },

    // ---------- SOCKET ----------
    initializeSocket: (retryCount = 0) => {
        const socket = getSocket();
        if (!socket) {
            if (retryCount < 10) {
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                setTimeout(() => {
                    get().initializeSocket(retryCount + 1);
                }, delay);
            }
            return;
        }

        console.log("✅ Status store socket initialized");

        socket.on("new_status", (newStatus) => {
            console.log("📨 new_status received:", newStatus._id);
            if (get().activeStatusUpdates.has(newStatus._id)) return;

            const currentUserId = useUserStore.getState().user?._id;
            const isOnStatusTab = get().isStatusTabActive;

            if (newStatus.user?._id !== currentUserId) {
                if (!isOnStatusTab) {
                    // 🔥 Only add to unseen (Dot) if user is NOT on Status tab
                    get().addUnseenStatus(newStatus._id);
                } else {
                    // 🔥 If user is ON Status Tab, we do NOTHING. 
                    // No Auto-view API call here, so no auto-count for Sender.
                    console.log("User is on Status tab, ignoring auto-view for:", newStatus._id);
                }
            }

            // Always update the list in real-time
            set((state) => {
                const exists = state.statuses.some((s) => s._id === newStatus._id);
                if (exists) return state;

                const updatedStatuses = [newStatus, ...state.statuses];
                const newRealTime = new Map(state.realTimeStatuses);
                newRealTime.set(newStatus._id, { ...newStatus, _lastUpdated: Date.now() });

                return {
                    statuses: updatedStatuses,
                    realTimeStatuses: newRealTime,
                    statusUpdateCounter: state.statusUpdateCounter + 1,
                };
            });

            get().activeStatusUpdates.add(newStatus._id);
            setTimeout(() => get().activeStatusUpdates.delete(newStatus._id), 100);
        })

        socket.on("status_deleted", ({ statusId }) => {
            console.log("🗑️ status_deleted:", statusId);
            get().removeUnseenStatus(statusId);
            set((state) => ({
                statuses: state.statuses.filter((s) => s._id !== statusId),
                realTimeStatuses: new Map([...state.realTimeStatuses].filter(([id]) => id !== statusId)),
                statusViewersMap: new Map([...state.statusViewersMap].filter(([id]) => id !== statusId)),
                statusReactionsMap: new Map([...state.statusReactionsMap].filter(([id]) => id !== statusId)),
                optimisticViewed: new Set([...state.optimisticViewed].filter(id => id !== statusId)),
                statusUpdateCounter: state.statusUpdateCounter + 1,
            }));
        });

        socket.on("status_viewed", (viewData) => {
            if (!viewData._immediate) return;
            const { statusId, viewer } = viewData;
            const currentUserId = useUserStore.getState().user?._id;

            if (viewer._id === currentUserId) {
                get().removeUnseenStatus(statusId);
            }

            set((state) => {
                const existingViewers = state.statusViewersMap.get(statusId) || [];
                if (existingViewers.some(v => v._id === viewer._id)) return state;

                const updatedViewers = [...existingViewers, viewer];
                const updatedMap = new Map(state.statusViewersMap);
                updatedMap.set(statusId, updatedViewers);

                return {
                    statusViewersMap: updatedMap,
                    statusUpdateCounter: state.statusUpdateCounter + 1,
                };
            });
        })

        socket.on("all_statuses_viewed", ({ userId }) => {
            const currentUserId = useUserStore.getState().user?._id;
            if (userId === currentUserId) {
                get().clearUnseenStatuses();
            }
        })

        socket.on("status_reaction", (data) => {
            if (!data._immediate) return;
            set((state) => {
                const statusId = data.statusId;
                const userId = data.userId;

                //^ Update reactions for the status
                const oldReactions = state.statusReactionsMap.get(statusId) || [];
                let newReactions;
                if (data.action === "add") {
                    newReactions = oldReactions.filter(r => r.user?._id !== userId && r.user !== userId);
                    newReactions.push({
                        user: { _id: userId, ...(data.viewer || {}) },
                        type: data.type,
                        createdAt: new Date()
                    });
                } else {
                    newReactions = oldReactions.filter(r => r.user?._id !== userId && r.user !== userId);
                }

                //& ✅ Viewers update - only update reaction type for the viewer, do not add/remove viewer here
                const oldViewers = state.statusViewersMap.get(statusId) || [];
                let newViewers;
                if (data.action === "add") {
                    newViewers = oldViewers.map(v =>
                        v._id === userId ? { ...v, reaction: data.type } : v
                    );
                    //& ❌ If viewer not in list, we do NOT add them here. They will be added when "status_viewed" event is received.
                } else {
                    newViewers = oldViewers.map(v =>
                        v._id === userId ? { ...v, reaction: null } : v
                    );
                }

                const newReactionsMap = new Map(state.statusReactionsMap);
                newReactionsMap.set(statusId, newReactions);

                const newViewersMap = new Map(state.statusViewersMap);
                newViewersMap.set(statusId, newViewers);

                const updatedStatuses = state.statuses.map(s =>
                    s._id === statusId ? { ...s, reactions: newReactions } : s
                );

                return {
                    statuses: updatedStatuses,
                    statusReactionsMap: newReactionsMap,
                    statusViewersMap: newViewersMap,
                    statusUpdateCounter: state.statusUpdateCounter + 1,
                };
            });
        })

        socket.on("status_reaction_global", ({ statusId, reactionCount }) => {
            set((state) => ({
                statuses: state.statuses.map((s) =>
                    s._id === statusId ? { ...s, reactionCount } : s
                ),
                statusUpdateCounter: state.statusUpdateCounter + 1,
            }));
        });

        socket.on("status_global_update", () => {
            setTimeout(() => get().fetchStatuses(), 500);
        });

        socket.on("status_viewer_updated", ({ statusId, viewerCount }) => {
            set((state) => ({
                statuses: state.statuses.map((s) =>
                    s._id === statusId ? { ...s, viewerCount } : s
                ),
                statusUpdateCounter: state.statusUpdateCounter + 1,
            }));
        });
    },

    cleanupSocket: () => {
        const socket = getSocket();
        if (socket) {
            socket.off("new_status");
            socket.off("status_deleted");
            socket.off("status_viewed");
            socket.off("all_statuses_viewed")
            // socket.off("status_reaction");
            // socket.off("status_reaction_global");
            // socket.off("status_global_update");
            // socket.off("status_viewer_updated");
        }
        set({
            activeStatusUpdates: new Set(),
            expiredStatuses: new Set(),
        });
    },

    // ---------- API CALLS ----------
    fetchStatuses: async () => {
        set({ loading: true, error: null });
        try {
            const { data } = await axiosInstance.get("/status");
            const statuses = data.data || [];
            const currentUserId = useUserStore.getState().user?._id;

            const unseenIds = new Set();
            statuses.forEach((status) => {
                const viewers = status.viewersWithReactions || [];
                if (status.user?._id !== currentUserId && !viewers.some(v => v._id === currentUserId)) {
                    unseenIds.add(status._id);
                }
            });

            set({
                statuses,
                loading: false,
                unseenStatusIds: unseenIds,
                statusUpdateCounter: get().statusUpdateCounter + 1,
            });
        } catch (error) {
            set({ error: error.message, loading: false });
        }
    },

    createStatus: async (statusData) => {
        set({ loading: true, error: null });
        try {
            const formData = new FormData();
            if (statusData.file) formData.append("media", statusData.file);
            if (statusData.content?.trim()) formData.append("content", statusData.content);
            if (statusData.caption?.trim()) formData.append("caption", statusData.caption);

            const { data } = await axiosInstance.post("/status", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            if (data.data) {
                set((state) => ({
                    statuses: [data.data, ...state.statuses],
                    loading: false,
                    statusUpdateCounter: state.statusUpdateCounter + 1,
                }));
            }
            return data.data;
        } catch (error) {
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    viewStatus: async (statusId) => {
        if (!statusId) return;
        const sIdString = statusId.toString();
        const currentUser = useUserStore.getState().user;
        const currentUserId = currentUser?._id?.toString();
        if (!currentUserId) return;

        // 🔥 Optimistic update: store FULL user object
        set((state) => {
            const updatedMap = new Map(state.statusViewersMap);
            const existing = updatedMap.get(sIdString) || [];

            // Check if already present (by user ID)
            const alreadyExists = existing.some(v => {
                if (typeof v === 'object' && v.user) {
                    return v.user._id?.toString() === currentUserId;
                }
                return v.toString?.() === currentUserId;
            });

            if (!alreadyExists) {
                // Create a proper viewer object
                const newViewer = {
                    user: {
                        _id: currentUserId,
                        username: currentUser.username || 'User',
                        profilePicture: currentUser.profilePicture || `https://ui-avatars.com/api/?name=${currentUser.username || 'User'}&background=random`
                    },
                    viewedAt: new Date().toISOString()
                };
                updatedMap.set(sIdString, [...existing, newViewer]);
            } else {
                // If exists but is a string, replace with object
                const updatedViewers = existing.map(v => {
                    if (typeof v === 'string' && v === currentUserId) {
                        return {
                            user: {
                                _id: currentUserId,
                                username: currentUser.username || 'User',
                                profilePicture: currentUser.profilePicture || `https://ui-avatars.com/api/?name=${currentUser.username || 'User'}&background=random`
                            },
                            viewedAt: new Date().toISOString()
                        };
                    }
                    return v;
                });
                updatedMap.set(sIdString, updatedViewers);
            }

            return {
                statusViewersMap: updatedMap,
                statusUpdateCounter: (state.statusUpdateCounter || 0) + 1
            };
        });

        try {
            await axiosInstance.put(`/status/${sIdString}/view`);
            get().fetchStatuses(); // background sync
        } catch (error) {
            console.error('❌ viewStatus API error:', error.message);
        }
    },

    deleteStatus: async (statusId) => {
        try {
            set({ loading: true });
            get().removeUnseenStatus(statusId); // 🔥 Remove from unseen
            await axiosInstance.delete(`/status/${statusId}`);

            set((state) => ({
                statuses: state.statuses.filter((s) => s._id !== statusId),
                realTimeStatuses: new Map([...state.realTimeStatuses].filter(([id]) => id !== statusId)),
                statusViewersMap: new Map([...state.statusViewersMap].filter(([id]) => id !== statusId)),
                statusReactionsMap: new Map([...state.statusReactionsMap].filter(([id]) => id !== statusId)),
                optimisticViewed: new Set([...state.optimisticViewed].filter(id => id !== statusId)),
                loading: false,
                statusUpdateCounter: state.statusUpdateCounter + 1,
            }));

            await get().fetchStatuses();
        } catch (error) {
            set({ error: error.message, loading: false });
            throw error;
        }
    },

    getStatusViewers: async (statusId) => {
        try {
            set({ loading: true });
            const { data } = await axiosInstance.get(`/status/${statusId}/viewers`);
            const viewers = data.data || [];
            set((state) => {
                const newMap = new Map(state.statusViewersMap);
                newMap.set(statusId, viewers);
                return {
                    statusViewersMap: newMap,
                    loading: false,
                    statusUpdateCounter: state.statusUpdateCounter + 1,
                };
            });
            return viewers;
        } catch (error) {
            set({ error: error.message, loading: false });
            return [];
        }
    },

    reactToStatus: async (statusId, type, userId) => {
        try {
            const { data } = await axiosInstance.post(`/status/${statusId}/reaction`, { type });
            if (data.data) {
                const serverStatus = data.data;
                set((state) => {
                    const newReactionsMap = new Map(state.statusReactionsMap);
                    newReactionsMap.set(statusId, serverStatus.reactions || []);
                    const newViewersMap = new Map(state.statusViewersMap);
                    newViewersMap.set(statusId, serverStatus.viewersWithReactions || []);
                    const updatedStatuses = state.statuses.map(s =>
                        s._id === statusId ? { ...s, reactions: serverStatus.reactions } : s
                    );
                    return {
                        statusReactionsMap: newReactionsMap,
                        statusViewersMap: newViewersMap,
                        statuses: updatedStatuses,
                        statusUpdateCounter: state.statusUpdateCounter + 1,
                    };
                });
            }
            return data.data;
        } catch (error) {
            console.error("❌ reactToStatus API error:", error);
            set({ error: error.message });
            throw error;
        }
    },

    removeReaction: async (statusId, userId) => {
        set((state) => {
            const newReactionsMap = new Map(state.statusReactionsMap);
            const oldReactions = newReactionsMap.get(statusId) || [];
            const filtered = oldReactions.filter(r => r.user?._id !== userId && r.user !== userId);
            newReactionsMap.set(statusId, filtered);

            const newViewersMap = new Map(state.statusViewersMap);
            const viewers = newViewersMap.get(statusId) || [];
            const updatedViewers = viewers.map(v => v._id === userId ? { ...v, reaction: null } : v);
            newViewersMap.set(statusId, updatedViewers);

            const updatedStatuses = state.statuses.map(s =>
                s._id === statusId ? { ...s, reactions: filtered } : s
            );

            return {
                statusReactionsMap: newReactionsMap,
                statusViewersMap: newViewersMap,
                statuses: updatedStatuses,
                statusUpdateCounter: state.statusUpdateCounter + 1,
            };
        });

        try {
            await axiosInstance.delete(`/status/${statusId}/reaction`);
        } catch (error) {
            get().fetchStatuses();
            set({ error: error.message });
            throw error;
        }
    },

    // 🔥 NEW: Check if current user has any unseen statuses (uses unseenStatusIds)
    hasUnseenStatuses: (userId) => {
        const { unseenStatusIds } = get();
        return unseenStatusIds.size > 0;
    },

    // 🔥 NEW: Mark all statuses as viewed
    markAllStatusesAsViewed: async (userId) => {
        if (!userId) return;

        // Optimistically clear dot
        get().clearUnseenStatuses();

        const socket = getSocket();
        if (socket) {
            socket.emit("mark_all_statuses_viewed", { userId });
        }
    },

    getGroupedStatus: () => {
        const { statuses, statusViewersMap, statusReactionsMap, realTimeStatuses } = get();
        return statuses.reduce((acc, status) => {
            const statusUserId = status.user?._id;
            if (!statusUserId) return acc;

            const realTimeStatus = realTimeStatuses.get(status._id) || status;

            if (!acc[statusUserId]) {
                acc[statusUserId] = {
                    id: statusUserId,
                    name: realTimeStatus.user?.username,
                    avatar: realTimeStatus.user?.profilePicture,
                    statuses: [],
                };
            }

            const viewers = statusViewersMap.get(status._id) || [];
            const reactions = statusReactionsMap.get(status._id) || [];
            const media = realTimeStatus.content;
            const caption = realTimeStatus.caption || '';

            acc[statusUserId].statuses.push({
                id: realTimeStatus._id,
                media,
                contentType: realTimeStatus.contentType,
                duration: realTimeStatus.duration,
                timeStamp: realTimeStatus.createdAt,
                viewers,
                reactions,
                shareCount: realTimeStatus.shareCount || 0,
                reactionCount: reactions.length,
                caption,
            });

            acc[statusUserId].statuses.sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp));
            return acc;
        }, {});
    },

    getUserStatuses: (userId) => {
        const grouped = get().getGroupedStatus();
        return userId ? grouped[userId] || null : null;
    },

    getOtherStatuses: (userId) => {
        const grouped = get().getGroupedStatus();
        const contacts = Object.values(grouped).filter((contact) => contact.id !== userId);
        const uniqueContacts = [];
        const seen = new Set();
        for (const contact of contacts) {
            if (!seen.has(contact.id)) {
                seen.add(contact.id);
                uniqueContacts.push(contact);
            }
        }
        return uniqueContacts;
    },

    cleanupExpiredStatuses: () => {
        const now = new Date();
        set((state) => {
            const expiredIds = state.statuses
                .filter(s => new Date(s.statusExpireAt) <= now)
                .map(s => s._id);

            const newUnseen = new Set(state.unseenStatusIds);
            expiredIds.forEach(id => newUnseen.delete(id));

            return {
                statuses: state.statuses.filter(s => new Date(s.statusExpireAt) > now),
                unseenStatusIds: newUnseen,
                statusUpdateCounter: state.statusUpdateCounter + 1,
            };
        });
    },

    clearError: () => set({ error: null }),

    reset: () =>
        set({
            statuses: [],
            loading: false,
            error: null,
            realTimeStatuses: new Map(),
            statusViewersMap: new Map(),
            statusReactionsMap: new Map(),
            activeStatusUpdates: new Set(),
            expiredStatuses: new Set(),
            optimisticViewed: new Set(),
            isStatusTabActive: false,
            statusUpdateCounter: 0,
            unseenStatusIds: new Set(),
        }),
}));

export default useStatusStore;