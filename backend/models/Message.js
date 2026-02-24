import mongoose from "mongoose"
import Conversation from "./Conversation.js"
import User from "./UserModel.js"


/*
 * Message Schema — defines structure for chat messages in a conversation.
 * Supports text, media, reactions, and delivery tracking.
*/

const messageSchema = new mongoose.Schema({
    //~  1.Reference to the conversation this message belongs to
    conversation: {
        type:mongoose.Schema.Types.ObjectId,
        ref: "Conversation", //& It comes from "Conversation.js"
        required: true,
        index: true // Added index for better performance
    },
    //~  2.The user who sent the message
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",  //& It comes from "UserModel.js" 
        required: true,
        index: true // Added index for better performance
    },
    //~  3.The user who received the message
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",  //& It comes from "UserModel.js"
        required: true,
        index: true // Added index for better performance
    },
    //~  4.The actual text content of the message
    content: {
        type: String
    },
    //~  5. URL to uploaded image or video (for media messages)
    imageOrVideoUrl: {
        type: String
    },
    //~  6.Type of content: text, image, or video
    contentType: {
        type: String,
        enum: ["text", "image", "audio", "video", "document"],
    },
    //~  7.Array of reactions (emoji + user who reacted)
    reactions: [{
        user: {  //&  User who reacted to the message
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"  //& It comes from "UserModel.js"
        },
        emoji: String   //& Emoji used for reaction
    }],
    //~  8.Tracks message delivery status for tick indicators
    messageStatus: {
        type: String,
        enum: ["sent", "delivered", "read"],  //&  Message lifecycle states
        default: "sent"
    },
    // 🔴 NEW FIELD: Track who has deleted the message
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    //~
    fileName: {
        type: String,
        default: null
    },
    //~
    fileSize: {
        type: Number,
        default: null
    },
    //~s
    fileType: {
        type: String,
        default: null
    }
}, { timestamps: true }) //& Automatically adds createdAt and updatedAt timestamps


const Message = mongoose.model("Message", messageSchema)
export default Message