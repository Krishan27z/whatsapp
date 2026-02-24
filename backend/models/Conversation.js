import mongoose from "mongoose";
import User from "./UserModel.js";
import Message from "./Message.js";

/*
    This schema is designed to support:
 *   - Direct 1:1 chats
 *   - Group chats (extendable in future)
 *   - Quick access to the last message and unread counts
*/

const conversationSchema = new mongoose.Schema({
    //^ 1.Participants (More than 1) in the conversation ----->
    //?  - Array of User IDs referencing the User collection. It represents everyone involved in this chat thread.
    participants: [{
        type: mongoose.Schema.Types.ObjectId, // type: ObjectId → references the 'User' model from UserModel.js file
        ref: "User",  //&  Reference to the User model. (It comes from "UserModel.js")
        required: true
    }],

    //^ 2.Reference to the last message in this conversation ---->
    //? Used to quickly display the latest message in conversation lists (like WhatsApp chat previews)
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId, // type: ObjectId → references the 'Message' model from MessageModel.js file
        ref: "Message"  //&   Reference to the Message model. (It comes from "Message.js" file)
    },

    //^ 3.Tracks the number of unread messages in the conversation. 
    //? This helps show notification badges in the UI and improves user experience.
    unreadCounts: {
        type: Map,
        of: Number,
        default: () => new Map() // FIX: Changed from {} to () => new Map()
    }
}, { timestamps: true }) // Automatically adds createdAt and updatedAt timestamps

// Add indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ lastMessage: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema)
export default Conversation