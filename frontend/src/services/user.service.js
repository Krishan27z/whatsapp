import axiosInstance from "./url.service.js"

//! STEP-1: sendOtp() → This function is called from your React components when a user tries to log in or sign up.
//& It sends the user's phone/email to the backend to generate an OTP.
export const sendOtp = async (phoneNumber, phoneSuffix, email) => {
    try {
        //& Frontend sends a POST request to the backend endpoint '/auth/send-otp'
        //& axiosInstance already has baseURL = process.env.REACT_APP_API_URL + "/api"
        //& So full URL = http://localhost:8000/api/auth/send-otp
        //& Request body contains: { phoneNumber, phoneSuffix, email }
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.post('/auth/send-otp', { phoneNumber, phoneSuffix, email })

        //& Backend receives this request in 'authController.js' file → sendOtp(req, res)
        //^ Backend flow (from authController.js):
        // 1️⃣ Extracts phoneNumber, phoneSuffix, email from req.body
        // 2️⃣ Generates a 6-digit OTP using otpGenerator()
        // 3️⃣ Checks MongoDB 'User' collection if this user already exists
        // 4️⃣ Creates new user or updates OTP fields for existing user
        // 5️⃣ Sends OTP via Email (sendOtpToEmail) or SMS (sendOtpToPhoneNumber using Twilio)
        // 6️⃣ Responds with JSON { success, message, data } to frontend

        //& Frontend receives this response here
        //& 'response.data' contains the JSON sent by backend, e.g., { email } or { phoneNumber }
        return response.data
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}


//! STEP-2: verifyOtp() → This function is called when the user submits the OTP they received. It sends the OTP (and phone/email) to the backend which will verify it and authenticate the user.
export const verifyOtp = async (phoneNumber, phoneSuffix, otp, email) => {
    try {
        //& Frontend sends a POST request to the backend endpoint '/auth/verify-otp'
        //& The real request URL becomes: http://localhost:8000/api/auth/verify-otp
        //& Request body contains: { phoneNumber, phoneSuffix, otp, email }
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.post('/auth/verify-otp', { phoneNumber, phoneSuffix, otp, email })

        //& Backend receives this request in 'authController.js' file → verifyOtp(req, res)
        //^ Backend flow (from authController.js):
        // 1️⃣ Extracts phoneNumber, phoneSuffix, otp, email from req.body
        // 2️⃣ If email flow: -> Finds user by email, checks stored 'user.emailOtp' and 'expiry'.
        // 3️⃣ If phone flow: -> Finds user by phone, uses Twilio verify service to confirm OTP.
        // 4️⃣ If OTP is valid:
        /*     -> Marks user.isVerified = true, clears OTP fields, saves user in DB.
               -> Generates a JWT via generateToken(user._id).
               -> Sets cookie on response: res.cookie("auth_token", token, { httpOnly: true, ... })
               -> Returns JSON with user data and token info (for debugging), e.g., { success: true, message: "OTP verified successfully", data: { user, token } }
               -> If invalid/expired -> returns 400/404 with error message.  
        */
        //& Frontend receives the backend JSON here.
        //& 'response.data' typically includes details returned by backend (user, token, messages).
        return response.data
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}


//! STEP-3: updateUserProfile() → This function is called when the user submits profile changes (name, avatar, bio, etc.).
export const updateUserProfile = async (updateData) => {
    try {
        //& Frontend sends a PUT request to backend endpoint '/auth/update-profile'
        //& The real request URL becomes: http://localhost:8000/api/auth/update-profile
        //& Request payload: updateData (object containing the fields to update)
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.put('/auth/update-profile', updateData, {
            headers: { "Content-Type": "multipart/form-data" } //? If updateData includes files, set content type to multipart/form-data
        })

        //& Backend receives this request in 'authController.js' file → updateProfile(req, res)
        //^ Backend flow (from authController.js):
        // 1️⃣ authMiddleware verifies the JWT (from cookie or Authorization header) and decodes it. The decoded payload is assigned to the request object: req.user = decoded. e.g. decoded === { userId: "64a3f...", iat: 170..., exp: 173... }. iat ← issued-at timestamp, exp ← expiry timestamp. 
        // 2️⃣ The controller finds the user by that userId (User.findById(userId)); if not found => 404.
        // 3️⃣ If req.file exists (frontend uploaded a file), backend uploads it to Cloudinary:
        //     • uploadFileToCloudinary(file) → returns uploadResult with secure_url
        //     • The backend sets user.profilePicture = uploadResult.secure_url
        // 4️⃣ Else, if req.body.profilePicture is provided (a URL), backend sets user.profilePicture = req.body.profilePicture
        // 5️⃣ Backend updates other allowed fields if provided:
        //     • if (username) user.username = username
        //     • if (agreed) user.agreed = agreed
        //     • if (about) user.about = about
        // 6️⃣ Saves the updated user (await user.save()) and returns success response:
        //     response(res, 200, true, "User Profile Updated Successfully", user)
        // 7️⃣ On errors (missing auth, validation, upload failure, DB error) backend responds with appropriate 4xx/5xx codes.
        //& Frontend receives the backend JSON here.
        return response.data
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}


//! STEP-4: checkUserAuth() → This function is called to verify if the current user is authenticated.
export const checkUserAuth = async () => {
    try {
        //& Frontend sends a GET request to backend endpoint '/auth/check-auth'
        //& The real request URL becomes: http://localhost:8000/api/auth/check-auth
        //& This endpoint is protected by authMiddleware, which reads the JWT token from the cookie (auth_token) or Authorization header and attaches req.user.userId
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.get('/auth/check-auth')
        if(response.data.status === 'success'){
            return {    //& If User is authenticated, return object with user info
                isAuthenticated: true,
                user: response?.data?.data
            }
        }
        else if(response.data.status === 'error'){
            return { isAuthenticated: false }
        }
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}


//! STEP-5: logOutUser() → This function is called when the user wants to log out.
export const logOutUser = async () => {
    try {
        //& Frontend sends a GET request to backend endpoint '/auth/logout'
        //& The real request URL becomes: http://localhost:8000/api/auth/logout
        //& Backend flow (from authController.js):
        // 1️⃣ Clears the auth_token cookie by setting it empty and expired immediately
        //    res.cookie("auth_token", "", { expires: new Date(0), httpOnly: true, sameSite: "lax", secure: false })
        // 2️⃣ Returns a success response: { success: true, message: "User Logged Out Successfully" }
        //& The frontend receives this response to confirm the user is logged out.
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.get('/auth/logout')
        return response.data
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}


//! STEP-6: getAllUsers() → This function is called to fetch all users except the currently logged-in user.
export const getAllUsers = async () => {
    try {
        //& Frontend sends a GET request to backend endpoint '/auth/users'
        //& The real request URL becomes: http://localhost:8000/api/auth/users
        //^ Backend flow (from authController.js):
        // 1️⃣ authMiddleware verifies the JWT (from cookie or Authorization header) and decodes it. The decoded payload is assigned to the request object: req.user = decoded. e.g. decoded === { userId: "64a3f...", iat: 170..., exp: 173... }. iat ← issued-at timestamp, exp ← expiry timestamp. 
        // 2️⃣ Controller extracts logged-in user ID: req.user.userId
        // 3️⃣ Converts string ID to MongoDB ObjectId and queries User collection:
        //    - Excludes the logged-in user with {_id: {$ne: loggedInUserId}}
        //    - Selects only needed fields: username, phoneNumber, phoneSuffix, profilePicture, about, lastSeen, isOnline
        //    - Converts documents to plain JS objects using .lean()
        // 4️⃣ For each user, controller checks if a conversation exists with logged-in user:
        //    - Uses Conversation.findOne({ participants: { $all: [loggedInUserId, user._id] } })
        //    - Populates lastMessage with content, sender, receiver, createdAt
        //    - If no conversation, attaches null
        // 5️⃣ Returns response with array of users including their last conversation (if any)
        //& The frontend receives this JSON and can render user list + conversation preview.
        //^ "axiosInstance" got from "url.service.js" file
        const response = await axiosInstance.get('/auth/users')
        return response.data
    } catch (error) {
        throw error.response ? error.response.data : error.message
    }
}