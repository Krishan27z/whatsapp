import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    unique: true, //& Ensures no two users have same phone number
    sparse: true, //& Allows multiple users to NOT have a phone number (null or missing). Without 'sparse: true', MongoDB would throw an error if more than one user had phoneNumber = null, because 'unique' applies to all values
  },
  phoneSuffix: {  //& 🌍 Stores country or region-specific suffix (e.g., +91, +1, etc.)
    type: String,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,  // & allows multiple null values
    trim: true,  //& removes spaces before and after username
  },
  email: {
    type: String,
    lowercase: true,   //& converts email to lowercase automatically
    trim: true,
    unique: true, //& prevents duplicate email registrations
    sparse: true, //& ✅ This allows multiple nulls
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,  //& ✅ regex pattern to ensure email format is valid
      "Please fill a valid email address",
    ],
  },
  emailOtp: {
    type: String
  },
  emailOtpExpire: {
    type: Date
  },
  profilePicture: {  //& 🖼️ Profile picture URL (e.g., uploaded to Cloudinary or Firebase)
    type: String
  },
  about: {    //& 💬 User's "About" or status line (like “Hey there! I’m using WhatsApp”)
    type: String
  },
  lastSeen: {
    type: Date
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isVerified: {    //&  ✅ Whether user’s email or phone is verified
    type: Boolean,
    default: false
  },
  agreed: {    //& 📄 Whether user accepted Terms & Conditions during signup
    type: Boolean,
    default: false
  }

}, { timestamps: true })   //& 🕒 Automatically adds createdAt and updatedAt timestamps

const User = mongoose.model("User", userSchema) //^ 'User' is the model name (or, Table name). Mongoose auto-pluralizes it to 'users' for the collection name in MongoDB.
export default User