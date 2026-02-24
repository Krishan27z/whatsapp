import { uploadFileToCloudinary } from "../config/cloudinaryConfig.js"
import mongoose from "mongoose"
import Status from "../models/Status.js"
import response from "../utils/responseHandler.js"

//! =======================================================================
//* 🟢 CONTROLLER: createStatus()
//~ ----------------------------------------------------------------------------
//* This controller allows users to create a new Status (like WhatsApp).
//* A status can be text, image, or video and expires automatically after 24 hours.
//
//* Steps:
//*  1️. Extract content and file from the request.
//*  2️. Upload image/video to Cloudinary if attached.
//*  3️. Determine content type (text/image/video).
//*  4️. Set expiry time (24 hours).
//*  5️. Save the new status to MongoDB.
//*  6️. Populate and return the saved status as response.
//! =======================================================================

//^ 1️⃣) Create My Status ---------->
const createStatus = async (req, res) => {
    try {
        const { content, contentType, caption  } = req.body //~ Extract content (text), contentType (text/image/video), Caption (for Img/Vdo in Status) from body
        const userId = req.user.userId  //* Get the currently logged-in user's ID (from authMiddleware.js)
        const file = req.file  //~ If the message includes a file (image/video), it will be available here via 'multer' middleware [from /config/cloudinaryConfig.js]

        let mediaUrl = null
        let finalContentType = contentType || 'text'   //& Default type = text
        let videoDuration = null

        //^ 1. HANDLE FILE UPLOAD (if the user uploaded an image or video)
        if (file) {
            //~ Upload the file to Cloudinary and get a response containing the 'secure_url'
            const uploadFile = await uploadFileToCloudinary(file, { forStatus: true }) //& 'uploadFileToCloudinary' FROM '/config/cloudinaryConfig.js' file

            //~  If upload fails or no URL is returned, send an error response
            if (!uploadFile?.secure_url) {
                return response(res, 400, false, "Failed to upload media")
            }

            //~  If upload doesn't fail & URL is returned, Store the 'secure_url' returned by Cloudinary
            mediaUrl = uploadFile?.secure_url

            //~ 🔴 Capture duration for video status
            if (file.mimetype.startsWith('video/')) {
                videoDuration = uploadFile.duration || null
            }

            //~ Determine the type of file based on 'MIME type' (e.g. "image/png" or "video/mp4") of the file 
            if (file.mimetype.startsWith('image')) {
                finalContentType = "image"     //&  If file is an image
            }
            else if (file.mimetype.startsWith('video')) {
                finalContentType = "video"    //&  If file is a video
                videoDuration = uploadFile.duration || 30 // 🔥 FALLBACK 30
            }
            else if (file.mimetype.includes('heic') || file.mimetype.includes('heif')) {
                finalContentType = "image"
            }
            else {
                return response(res, 400, false, "Unsupported File Type")  //&  If file is neither image nor video → reject upload
            }
        }
        //^ 2. HANDLE TEXT MESSAGE IF NO FILE IS UPLOADED
        else if (content?.trim()) {
            finalContentType = 'text'
        }
        //^ 3. IF NEITHER FILE NOR TEXT EXISTS, RETURN ERROR
        else {
            return response(res, 400, false, "Message Content is required")
        }
        //^ 4. SET STATUS EXPIRY TIME (like WhatsApp, expires in 24 hours)
        const expiryAt = new Date()
        expiryAt.setHours(expiryAt.getHours() + 24)  //&  Add 24 hours (1 full day) to the current time to set the expiry

        //^ 5. CREATE NEW STATUS DOCUMENT & SAVE TO MONGODB
        const status = new Status({    // 'Status' table FROM 'Status.js' file
            user: userId,             //? The user who created the status
            content: mediaUrl || content, //? Either Cloudinary URL or text message
            contentType: finalContentType, //? updated 'contentType' comes FROM this 'statusController.js' file (but actually initialized in 'Status.js' file)
            caption: caption || '', // 👈 SAVE CAPTION
            duration: finalContentType === 'video' ? videoDuration : null, // 👈 STORE DURATION
            statusExpireAt: expiryAt,    //? Set expiry date/time
            viewers: [],
            reactions: [],
            shareCount: 0
        })
        await status.save()

        //^ 6. POPULATE USER DETAILS FOR RESPONSE
        //~ Fetch the status again and populate user & viewer details
        const populatedStatus = await Status.findById(status?._id) // 'Status' table FROM 'Status.js' file
            .populate("user", "username profilePicture")     //&  Show user's name & photo
            .populate("viewers.user", "username profilePicture")  //&  Show viewers' names & photos
            .populate("reactions.user", "username profilePicture")


        //! EMIT SOCKET EVENT FOR REAL TIME =======================>
        if (req.io && req.socketUserMap) { //~ 'req.io' and 'req.socketUserMap' come from 'index.js' file where we attached Socket.IO to each request

            //* Broadcast status to all connecting users except the creator.
            //& Iterate through all online users stored inside the Map (req.socketUserMap)
            //& Each entry in a Map contains a key–value pair → [connectedUserId, socketId]
            //& Using JavaScript array destructuring [connectedUserId, socketId] to extract both userId & socketId from each entry
            //^ 'connectedUserId' is the user's ID saved when they connected in 'socketService.js' (inside "user_connected" event, LINE:56)
            //^ 'socketId' is required to send (emit) real-time events directly to that specific user’s active connection.
            // ------ We use both 'connectedUserId' & 'socketId' bcz --------
            //^ connectedUserId → identifies WHICH user is online 
            //^ socketId → tells WHERE (which socket connection) to send the message

            const statusData = {
                ...populatedStatus.toObject(),
                _realTime: true,
                _timestamp: Date.now(),
                _immediate: true
            }

            // 🔴 BROADCAST TO ALL ONLINE USERS EXCEPT CREATOR
            for (const [onlineUserId, socketSet] of req.socketUserMap) { //~ 'socketUserMap' comes from '/services/socketService.js' file
                if (onlineUserId !== userId.toString()) { //~ Skip the status creator
                    socketSet.forEach((_, socketId) => {
                        req.io.to(socketId).emit("new_status", statusData) //& Emit (send) 'new_status' event to each connected user's socket
                    })
                }
            }

            // 🔴 ALSO SEND TO CREATOR FOR CONSISTENCY
            const creatorSockets = req.socketUserMap.get(userId.toString())
            if (creatorSockets) {
                creatorSockets.forEach((_, socketId) => {
                    req.io.to(socketId).emit("new_status", statusData)
                })
            }

            // 🔴 GLOBAL BROADCAST FOR STATUS UPDATE
            req.io.emit("status_global_update", {
                type: 'created',
                statusId: status._id,
                userId: userId,
                _immediate: true,
            })
        }
        return response(res, 201, true, "Status Created Successfully", populatedStatus)
    } catch (error) {
        console.log(error)
        return response(res, 500, false, "Internal Server Error")
    }
}


//! =============================================================================================================

//^ 2️⃣) GET ALL Statuses --------->
const getStatus = async (req, res) => {
    try {
        const statuses = await Status.find({ statusExpireAt: { $gt: new Date() } })
            .populate("user", "username profilePicture")
            .populate("viewers.user", "username profilePicture")  // ✅ populate full details
            .populate("reactions.user", "username profilePicture")
            .sort({ createdAt: 1 })  // 🔥 FIXED: oldest first

        // 🔥 ATTACH MERGED VIEWERS (with reaction) TO EACH STATUS
        const enrichedStatuses = statuses.map(status => {
            const statusObj = status.toObject()
            statusObj.viewersWithReactions = statusObj.viewers.map(viewer => ({
                _id: viewer.user._id,
                username: viewer.user.username,
                profilePicture: viewer.user.profilePicture,
                viewedAt: viewer.viewedAt,
                reaction: statusObj.reactions?.find(
                    r => r.user?._id?.toString() === viewer.user._id.toString()
                )?.type || null
            }))
            return statusObj
        })

        return response(res, 200, true, "Status Retrieved Successfully", enrichedStatuses)
    } catch (error) {
        console.log(error)
        return response(res, 500, false, "Internal Server Error")
    }
}

//! =============================================================================================================

//^ 3️⃣) Number of viewers that watch my status --------->
const viewStatus = async (req, res) => {
    const { statusId } = req.params;
    const userId = req.user.userId;

    try {
        // 🔥 STEP 1: ADD VIEWER ONLY IF NOT ALREADY PRESENT
        const pushResult = await Status.updateOne(
            {
                _id: new mongoose.Types.ObjectId(statusId),
                "viewers.user": { $ne: new mongoose.Types.ObjectId(userId) }
            },
            {
                $push: {
                    viewers: {
                        user: new mongoose.Types.ObjectId(userId),
                        viewedAt: new Date(),      // ⏳ FIRST VIEW TIME – FIXED FOREVER
                        _id: new mongoose.Types.ObjectId()
                    }
                }
            }
        );

        // 🔥 STEP 2: FETCH UPDATED STATUS (always return latest data)
        const updatedStatus = await Status.findById(statusId)
            .populate("user", "username profilePicture")
            .populate("viewers.user", "username profilePicture")
            .populate("reactions.user", "username profilePicture");

        if (!updatedStatus) {
            return response(res, 404, false, "Status Not Found");
        }

        // 🔥 STEP 3: ONLY IF NEW VIEWER ADDED – EMIT SOCKET EVENT
        if (pushResult.modifiedCount > 0) {
            // Prepare SINGLE viewer object for socket
            const viewerEntry = updatedStatus.viewers.find(
                v => v.user._id.toString() === userId.toString()
            );

            const viewerObject = {
                _id: userId,
                username: viewerEntry?.user?.username || 'Unknown',
                profilePicture: viewerEntry?.user?.profilePicture || null,
                viewedAt: viewerEntry?.viewedAt || new Date()
            };

            // 📡 REAL‑TIME EMIT TO STATUS OWNER
            if (req.io && typeof req.io.emitToUser === 'function') {
                req.io.emitToUser(updatedStatus.user._id.toString(), "status_viewed", {
                    statusId,
                    viewer: viewerObject,
                    totalViewers: updatedStatus.viewers.length,
                    _immediate: true,
                    _timestamp: Date.now()
                });
                console.log(`📡 First view: ${userId} viewed status ${statusId}`);
            }

            // 🌍 Global count update (for status list)
            if (req.io) {
                req.io.emit("status_viewer_updated", {
                    statusId,
                    viewerCount: updatedStatus.viewers.length,
                    _immediate: true
                });
            }
        } else {
            console.log(`👁️ Repeated view by ${userId} – no update, no emit`);
        }

        return response(res, 200, true, "Status Viewed Successfully", updatedStatus);
    } catch (error) {
        console.error("❌ viewStatus error:", error);
        return response(res, 500, false, "Internal Server Error: " + error.message);
    }
}

//* 🟢 GET STATUS VIEWERS (with reaction info)
//! =======================================================================
const getStatusViewers = async (req, res) => {
    const { statusId } = req.params;

    try {
        const status = await Status.findById(statusId)
            .populate("viewers.user", "username profilePicture")
            .populate("reactions.user", "username profilePicture");

        if (!status) {
            return response(res, 404, false, "Status Not Found");
        }

        // Merge reaction data into viewer list
        const viewersWithReactions = status.viewers.map((viewer) => ({
            _id: viewer.user._id,
            username: viewer.user.username,
            profilePicture: viewer.user.profilePicture,
            viewedAt: viewer.viewedAt,
            reaction: status.reactions.find(
                (r) => r.user._id.toString() === viewer.user._id.toString()
            )?.type || null,
        }));

        return response(res, 200, true, "Viewers retrieved", viewersWithReactions);
    } catch (error) {
        console.error(error);
        return response(res, 500, false, "Internal Server Error");
    }
};

//! =======================================================================
//* 🟢 ADD / UPDATE REACTION
//! =======================================================================
const reactToStatus = async (req, res) => {
  const { statusId } = req.params;
  const userId = req.user.userId;
  const { type } = req.body;

  const validTypes = ["love", "like", "wow", "sad"];
  if (!validTypes.includes(type)) {
    return response(res, 400, false, "Invalid reaction type");
  }

  try {
    const status = await Status.findById(statusId);
    if (!status) return response(res, 404, false, "Status Not Found");

    status.reactions = status.reactions.filter(
      (r) => r.user.toString() !== userId.toString()
    );
    status.reactions.push({ user: userId, type, createdAt: new Date() });
    await status.save();

    const updatedStatus = await Status.findById(statusId)
      .populate("user", "username profilePicture")
      .populate("viewers.user", "username profilePicture")
      .populate("reactions.user", "username profilePicture");

    // 🔥 SOCKET EMIT – owner এর সব socket এ পাঠাও
    if (req.io && req.socketUserMap) {
      const reactingUser = updatedStatus.reactions.find(
        r => r.user._id.toString() === userId.toString()
      )?.user;

      const reactionData = {
        statusId,
        userId,
        type,
        action: "add",
        _immediate: true,
        _timestamp: Date.now(),
        viewer: reactingUser ? {
          _id: reactingUser._id,
          username: reactingUser.username,
          profilePicture: reactingUser.profilePicture,
        } : null,
      };

      const ownerId = status.user.toString();
      const ownerSockets = req.socketUserMap.get(ownerId);
      if (ownerSockets) {
        ownerSockets.forEach((_, socketId) => {
          req.io.to(socketId).emit("status_reaction", reactionData);
        });
      }

      req.io.emit("status_reaction_global", {
        ...reactionData,
        reactionCount: updatedStatus.reactions.length,
      });
    }

    return response(res, 200, true, "Reaction added", updatedStatus);
  } catch (error) {
    console.error("❌ reactToStatus error:", error);
    return response(res, 500, false, `Internal Server Error: ${error.message}`);
  }
}

//! =======================================================================
//* 🟢 REMOVE REACTION
//! =======================================================================
const removeReaction = async (req, res) => {
  const { statusId } = req.params;
  const userId = req.user.userId;

  try {
    const status = await Status.findById(statusId);
    if (!status) return response(res, 404, false, "Status Not Found");

    status.reactions = status.reactions.filter(
      (r) => r.user.toString() !== userId.toString()
    );
    await status.save();

    const updatedStatus = await Status.findById(statusId)
      .populate("user", "username profilePicture")
      .populate("viewers.user", "username profilePicture")
      .populate("reactions.user", "username profilePicture");

    // 🔥 SOCKET EMIT – owner এর সব socket এ পাঠাও
    if (req.io && req.socketUserMap) {
      const reactionData = {
        statusId,
        userId,
        action: "remove",
        _immediate: true,
        _timestamp: Date.now(),
      };

      const ownerId = status.user.toString();
      const ownerSockets = req.socketUserMap.get(ownerId);
      if (ownerSockets) {
        ownerSockets.forEach((_, socketId) => {
          req.io.to(socketId).emit("status_reaction", reactionData);
        });
      }

      req.io.emit("status_reaction_global", {
        ...reactionData,
        reactionCount: updatedStatus.reactions.length,
      });
    }

    return response(res, 200, true, "Reaction removed", updatedStatus);
  } catch (error) {
    console.error("❌ removeReaction error:", error);
    return response(res, 500, false, "Internal Server Error");
  }
}

//! =============================================================================================================

//^ 4️⃣) Delete Status by the User --------->
const deleteStatus = async (req, res) => {
    const { statusId } = req.params
    const userId = req.user.userId

    try {
        const status = await Status.findById(statusId)
        if (!status) {
            return response(res, 404, false, "Status Not Found")
        }
        if (status.user.toString() !== userId.toString()) {
            return response(res, 403, false, "Not authorized to delete the status")
        }

        await status.deleteOne()

        // ✅  Socket Emit
        if (req.io && req.socketUserMap) {
            const deleteData = {
                statusId,
                userId,
                _immediate: true,
                _timestamp: Date.now()
            }

            // 
            for (const [_, socketSet] of req.socketUserMap.entries()) {
                socketSet.forEach((_, socketId) => {
                    req.io.to(socketId).emit("status_deleted", deleteData)
                })
            }

            req.io.emit("status_global_update", {
                type: "deleted",
                statusId,
                userId,
                _immediate: true
            })
        }

        return response(res, 200, true, "Status deleted successfully")
    } catch (error) {
        console.error(error)
        return response(res, 500, false, "Internal Server Error")
    }
}



// 🔴 ADD AUTO-CLEANUP FUNCTION
const cleanupExpiredStatuses = async () => {
    try {
        const result = await Status.deleteMany({ statusExpireAt: { $lt: new Date() } })

        if (result.deletedCount > 0) {
            console.log(`🧹 Auto-deleted ${result.deletedCount} expired statuses`)
        }
    } catch (error) {
        console.error("Error in auto-cleanup:", error)
    }
}

// Run cleanup every hour
setInterval(cleanupExpiredStatuses, 60 * 60 * 1000)



export {
    createStatus,
    getStatus,
    viewStatus,
    getStatusViewers,
    reactToStatus,
    removeReaction,
    deleteStatus,
}