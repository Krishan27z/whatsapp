import response from "../utils/responseHandler.js"
import User from "../models/UserModel.js"
import { sendOtpToEmail } from "../services/emailService.js"
import { sendOtpToPhoneNumber, verifyOtp as twilioVerifyOtp } from "../services/twilioService.js"
import otpGenerator from "../utils/otpGenerator.js"
import generateToken from "../utils/generateToken.js"
import { uploadFileToCloudinary } from "../config/cloudinaryConfig.js" //* Bcz. It's a named export from 'cloudinaryConfig.js' file
import Conversation from "../models/Conversation.js"
import mongoose from "mongoose"



//! STEP-1️⃣:  SEND OTP TO USER'S EMAIL OR PHONE NUMBER
const sendOtp = async (req, res) => {
    const { phoneNumber, phoneSuffix, email } = req.body  //& These parameters come from the frontend (client) or API testing tool (like Postman or Thunder-Client).

    //^  <------- GENERATE 6-DIGIT OTP -----------> 
    const otp = otpGenerator()  //*  This function comes from "utils/otpGenerator.js" file
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000) //& OTP is valid for 5 minutes from now
    console.log("Generated OTP:", otp)

    let user;
    //~  USER CAN SIGN UP USING EITHER EMAIL OR PHONE NUMBER    
    try {
        //! 1️⃣.1) If user is signing up with email
        if (email && email.trim() !== "") {
            console.log("📧 Checking user with email:", email)

            //& Check if user with this email already exists 
            user = await User.findOne({ email })  //* 'User' model comes from "models/UserModel.js" file
            console.log("Found user:", user)

            //🔥 FIX-1️⃣: DO NOT create permanent user here
            //🔥 Instead, create/update a TEMP OTP SESSION (upsert)
            if (!user) {
                console.log("🚨 No user found. Creating TEMP OTP session only...")
            }

            user = await User.findOneAndUpdate(
                { email },
                {
                    emailOtp: otp,
                    emailOtpExpire: otpExpiry,
                },
                {
                    upsert: true,          //& Creates doc ONLY for OTP session
                    new: true,
                    setDefaultsOnInsert: true,
                }
            )

            console.log("OTP session saved for email:", email)

            //~ Send the OTP to user's email address AFTER OTP session is stored
            await sendOtpToEmail(email, otp)  //* This function comes from "services/emailService.js" file
            console.log("✅ OTP Email Sent Successfully:", email)

            //* This response structure comes from "utils/responseHandler.js" file
            return response(res, 200, true, "OTP sent to email", { email })
        }

        //! 1️⃣.2) If user is signing up with phone number
        if (!phoneNumber || !phoneSuffix) {
            return response(res, 400, false, "Phone number and suffix are required")
        }

        //^ Combine suffix and number (e.g., +91 9876543210)
        const fullPhoneNumber = phoneSuffix + phoneNumber
        console.log("📱 Checking user with phone number:", fullPhoneNumber)

        //🔥 FIX-2️⃣: DO NOT create/save user for phone in STEP-1
        //🔥 Twilio itself manages OTP session
        //🔥 We only send OTP here

        //? Send the OTP to user's phone number via SMS using Twilio. 
        await sendOtpToPhoneNumber(fullPhoneNumber) //* OTP will be sent via Twilio service
        console.log("✅ OTP sent to phone number:", fullPhoneNumber)

        //* This response structure comes from "utils/responseHandler.js" file
        return response(res, 200, true, "OTP sent to phone number", { phoneNumber: fullPhoneNumber })
    } catch (error) {
        console.error("Error sending OTP:", error?.message || error)

        //🔥 FIX-3️⃣: No DB corruption now, safe to fail
        return response(
            res,
            500,
            false,
            "Server error: Failed to send OTP. Please try again later."
        )
    }
}




//! STEP-2️⃣:  VERIFY OTP & COMPLETE SIGNUP
const verifyOtp = async (req, res) => {
    const { email, phoneNumber, phoneSuffix, otp } = req.body
    //& These parameters come from frontend after user enters OTP

    try {
        let user;

        //! 2️⃣.1) VERIFY EMAIL OTP
        if (email && email.trim() !== "") {
            console.log("📧 Verifying OTP for email:", email)

            //& Find user OTP session
            user = await User.findOne({ email })

            //~ If no OTP session exists
            if (!user || !user.emailOtp) {
                return response(res, 400, false, "OTP not found. Please request OTP again.")
            }

            //~ Check OTP match
            if (String(user.emailOtp) !== String(otp)) {
                return response(res, 400, false, "Invalid OTP")
            }

            //~ Check OTP expiry
            if (user.emailOtpExpire < Date.now()) {
                return response(res, 400, false, "OTP expired. Please request a new one.")
            }

            //🔥 FIX-1️⃣: OTP is valid → NOW finalize user
            user.isVerified = true

            //🔥 Clean OTP fields after successful verification
            user.emailOtp = undefined
            user.emailOtpExpire = undefined

            await user.save()
            console.log("✅ Email verified successfully:", user._id)
        }

        //! 2️⃣.2) VERIFY PHONE OTP (Twilio already verified OTP)
        else {
            if (!phoneNumber || !phoneSuffix) {
                return response(res, 400, false, "Phone number and suffix are required")
            }

            const fullPhoneNumber = phoneSuffix + phoneNumber
            console.log("📱 Verifying OTP for phone:", fullPhoneNumber)

            // 🔥 CALL TWILIO VERIFY SERVICE
            const twilioVerify = await twilioVerifyOtp(fullPhoneNumber, otp);

            // Twilio returns 'approved' if the OTP is correct
            if (twilioVerify.status !== 'approved') {
                return response(res, 400, false, "Invalid or expired OTP. Please try again.");
            }

            // If we reach here, OTP is correct. Now find/create user
            user = await User.findOne({ phoneNumber: fullPhoneNumber })

            if (!user) {
                console.log("🚨 Creating verified phone user...")
                user = new User({
                    phoneNumber: fullPhoneNumber,
                    phoneSuffix,
                    isVerified: true,
                })
            } else {
                user.isVerified = true
            }

            await user.save()
            console.log("✅ Phone verified successfully:", user._id)
        }

        //! 2️⃣.3) GENERATE JWT TOKEN
        const token = generateToken(user._id)
        //* generateToken comes from "utils/generateToken.js"

        //* Set token in HTTP-only cookie
        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "None",  //^ MUST be None for cross-site cookies (frontend and backend on different domains)
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })

        //* Send success response
        return response(res, 200, true, "OTP verified successfully", {
            user: {
                _id: user._id,
                email: user.email,
                phoneNumber: user.phoneNumber,
                isVerified: user.isVerified,
            },
        })
    } catch (error) {
        console.error("Error verifying OTP:", error?.message || error)
        return response(res, 500, false, "Server error. Please try again later.")
    }
}




//!  STEP-3️⃣: UPDATE USER's PROFILE
const updateProfile = async (req, res) => {
    //^ Get values sent from frontend FormData -------> [pages/UserLogin/Login.jsx ------ (step-9)]
    //^ These values come from formData.append(...)
    const { username, agreed, about } = req.body

    //* Extract userId from decoded JWT token (set by 'authMiddleware.js' file)
    const userId = req.user.userId

    try {
        const user = await User.findById(userId) //*  use findById() instead of findOne(userId)
        if (!user) {
            return response(res, 404, false, "User Not Found")
        }
        //^ Get uploaded file (profile picture)
        //^ This comes from FormData key: "media"
        const file = req.file

        //~ 1️⃣. If a new file (profile picture) is uploaded from frontend
        if (file) {
            //* Upload file to Cloudinary
            const uploadResult = await uploadFileToCloudinary(file)  //* This function comes from "config/cloudinaryConfig.js" file
            console.log("Cloudinary upload result:", uploadResult)

            //* Save the Cloudinary image URL to user's profile in Database
            user.profilePicture = uploadResult?.secure_url
        }
        //~ 2️⃣. If frontend sends profilePicture URL directly (not file upload)
        else if (req.body.profilePicture) {
            user.profilePicture = req.body.profilePicture
        }
        //~ 3️⃣. Update other profile fields if provided
        if (username) user.username = username
        if (agreed) user.agreed = agreed
        if (about) user.about = about
        //~ 4️⃣. Save updated user info in MongoDB
        await user.save()
        // console.log(user)  //* We have to comment-out this to keep it private.

        // 🔥 REAL-TIME UPDATE LOGIC START 🔥
        // Amra 'req.io' use korbo jeta 'index.js' e middleware diye attach kora hoyechhe
        if (req.io) {
            const newUserObj = {
                _id: user._id,
                username: user.username,
                phoneNumber: user.phoneNumber,
                phoneSuffix: user.phoneSuffix,
                profilePicture: user.profilePicture,
                about: user.about,
                isOnline: true,
                conversation: null // Notun user tai kono message thakbe na initially
            }

            //& Let everyone see the existing user's updated Profile_img in both ChatList & ChatWindow_Header
            req.io.emit("USER_UPDATE_BROADCAST", newUserObj)
            console.log("📢 Broadcast: User profile updated for", user.username)
        }


        return response(res, 200, true, "User Profile Updated Successfully", user)
    } catch (error) {
        console.log(error)
        return response(res, 500, false, "Internal Server Error")
    }
}



//!  STEP-4️⃣: CHECK IF USER IS AUTHENTICATED
const checkAuthenticated = async (req, res) => {
    try {
        const userId = req.user.userId  //~ Extract userId from the JWT payload set by "authMiddleware.js"
        if (!userId) {
            return response(res, 404, false, "Unauthorized : Please Login before accessing Whatsapp")
        }
        const user = await User.findById(userId)  //~ Find the user in the database by ID
        if (!user) {
            return response(res, 404, false, "User not found!!!")
        }
        //^ If user exists and is authenticated, send success response
        return response(res, 200, true, "User retrieved & allowed to use Whatsapp", user)
    } catch (error) {
        console.log(error)
        return response(res, 500, false, "Internal Server Error")
    }
}



//!  STEP-5️⃣: LOG-OUT 
const logOut = (req, res) => {
    try {
        //& Clear the JWT auth token cookie by setting it empty & expired immediately
        //* Here, SYNTAX is: res.cookie(name, value, options)
        res.cookie("auth_token", "", {
            expires: new Date(0),  //~ new Date(0) → represents "Thu Jan 01 1970 05:30:00 GMT+0530" (IST). By setting it, the browser deletes the cookie instantly. 
            httpOnly: true,        //~ Prevent client-side JS access (security best practice)
            sameSite: "lax",       //~ Protects from CSRF attacks
            // secure: false  //~ Indicates that the cookie can be sent over HTTP (non-HTTPS) connections
            secure: process.env.NODE_ENV === "production"
            //~ In development on localhost, we usually don’t have HTTPS, so it must be false
            //~ In production, set secure: true to ensure cookies are only sent over HTTPS for security
        })
        //& Send success response after clearing cookie
        return response(res, 200, true, "User Logged Out Successfully")
    } catch (error) {
        return response(res, 500, false, "Internal Server Error")
    }
}



//!  STEP-6️⃣: Controller to fetch all users except the currently logged-in user.
const getAllUsers = async (req, res) => {
    //* [1] Extract the currently logged-in user's ID from the JWT payload.The 'authMiddleware.js' attaches 'req.user' to every authenticated request.
    const loggedInUser = (req.user.userId || req.user.id || "").trim() // trim to remove hidden spaces
    if (!loggedInUser) {
        console.error("Unauthorized: User ID missing in JWT payload", req.user)
        return response(res, 401, false, "Unauthorized: User ID missing")
    }

    //* [2] Convert logged-in user ID (string) → MongoDB ObjectId. (MongoDB stores all '_id' fields as 'ObjectId' type internally. When we decode the JWT, we get the userId as a plain string.)
    const loggedInUserId = new mongoose.Types.ObjectId(loggedInUser)

    //* [3] Fetch all other users from the DB except the logged-in user.
    try {
        //^ "User.find()" → A Mongoose query that retrieves documents from the "users" collection.
        //^ '$ne' = "not equal" → excludes the current user.
        //^ ".select(...)" → retrieves only specific fields we actually need to send to the frontend
        //^ ".lean()" converts Mongoose documents to plain JS objects (faster & lighter) & removes Mongoose methods and getters/setters

        const users = await User.find({
            _id: { $ne: loggedInUserId },
            isVerified: true,              // Shudhu verified user
            username: { $exists: true, $ne: "" } // Jader profile setup hoyeche
        }).select(
            "username phoneNumber phoneSuffix profilePicture about lastSeen isOnline" //? Get these from 'UserModel.js' file
        ).lean()  //? convert to plain JS objects for faster processing


        //* [4] For each retrieved user, check if a conversation already exists between them and the logged-in user
        //&  We use 'Promise.all' to run all these asynchronous operations in parallel for efficiency
        const usersWithConversation = await Promise.all(
            users.map(async (user) => {
                //& Find if a conversation exists with both participants (loggedInUser + current user)
                //&  - "$all" → ensures both IDs (loggedInUser + current user) exist in the "participants" array (in Conversation.js) in any order
                //?  'Conversation' from --> Conversation.js file
                const conversation = await Conversation.findOne({
                    participants: { $all: [loggedInUserId, user._id] } //? 'participants' from --> Conversation.js file
                })
                    .populate({ //^ Replaces the 'lastMessage' ObjectId in Conversation with the actual message document from 'Message' collection, so we can directly access its content, sender, receiver, and createdAt.
                        path: "lastMessage",  //& 'lastMessage' ---> indicates to "Conversation.js" file where we get --> ref: "Message" [which comes from "Message.js" file]
                        select: 'content createdAt sender receiver' //& We get these 4 things [content, createdAt, sender & receiver] from "Message.js" file
                    })
                    .lean()  //? convert to plain JS objects for faster processing

                //& Combine user details + related conversation (if any)
                //&  - If no conversation exists, attach "null"
                return {
                    ...user,
                    conversation: conversation || null
                }
            })
        )
        return response(res, 200, true, "Users retrieved successfully", usersWithConversation)
    } catch (error) {
        return response(res, 500, false, "Internal Server Error")
    }
}





export { sendOtp, verifyOtp, updateProfile, logOut, checkAuthenticated, getAllUsers }