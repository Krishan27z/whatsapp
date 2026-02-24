import mongoose from "mongoose"

const statusSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId, // type: ObjectId → references the 'User' model from UserModel.js file
        ref: "User",  //&  Reference to the User model. (It comes from "UserModel.js")
        required: true
    },
    content: {
        type: String,
        required: true
    },

    caption: {
        type: String,
        default: ''
    },

    contentType: {
        type: String,
        enum: ["text", "image", "video"],
        default: 'text'
    },

    // 🔴 NEW: Video duration in seconds (only for video status)
    duration: {
        type: Number,
        default: null
    },

    viewers: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // type: ObjectId → references the 'User' model from UserModel.js file, //&  Reference to the User model. (It comes from "UserModel.js")
            viewedAt: { type: Date, default: Date.now }
        }
    ],

    reactions: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            type: {
                type: String,
                enum: ["love", "like", "wow", "sad"],
                default: "love",
            },
            createdAt: { type: Date, default: Date.now },
        },
    ],

    shareCount: { type: Number, default: 0 },

    statusExpireAt: {
        type: Date,   //&  Date & time when the status expires
        required: true
    }
}, { timestamps: true })

// 🔴 ADD TTL INDEX FOR AUTO-DELETE AFTER 24 HOURS
statusSchema.index({ statusExpireAt: 1 }, {
    expireAfterSeconds: 0
})

const Status = mongoose.model("Status", statusSchema)
export default Status