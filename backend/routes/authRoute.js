//! This file is used to define all authentication-related API routes (like sending and verifying OTP)

import express from 'express'
import { sendOtp, verifyOtp, updateProfile, logOut, checkAuthenticated, getAllUsers } from '../controllers/authController.js'
import authMiddleware from '../middlewares/authMiddleware.js'
import { multerMiddleware } from '../config/cloudinaryConfig.js'


const router = express.Router()  //* Creating a new Express router instance


//^ 1️⃣. Route to send OTP (either to user's email or phone number)
router.post('/send-otp',sendOtp) 

//^ 2️⃣. Route to verify the OTP entered by the user
router.post('/verify-otp',verifyOtp) 

//^ ------3️⃣. "PROTECTED ROUTE" TO UPDATE USER's PROFILE --------
/*
To define a ‘protected route’ for updating the user’s profile — 
this route will first verify the user’s JWT token using authMiddleware.js, 
then handle file uploads (like profile pictures) via multerMiddleware mentioned in config/cloudinaryConfig.js, 
and finally call the updateProfile controller function from authController.js (in STEP-3) to update the user’s details in the database.
*/
router.put('/update-profile', authMiddleware, multerMiddleware, updateProfile) //~ 'PUT' method is used here because we are *updating* an existing user’s data (profile info or image).


//^ 4️⃣. User Authenticate Route ------>
// GET method is used because we are only retrieving information, not creating/updating/deleting anything.
// 'authMiddleware.js' runs first to check if the user has a valid JWT token.
// If the token is valid, it attaches 'req.user' and calls 'next()' to move to 'checkAuthenticated' (in authController.js file).
// 'checkAuthenticated' then verifies the user exists in DB and sends a response back to the client.
router.get('/check-auth', authMiddleware, checkAuthenticated)


//^ 5️⃣. LogOut Route ----->
// We use 'GET' method cuz logout is an action that doesn’t require a request body.
// It simply tells the server: "Clear the user session / token".
router.get('/logout', logOut)


//^ 6️⃣. Route to fetch all users except the currently logged-in user ----->
//     GET '/users' → Protected route that fetches all users except the logged-in user
//   - authMiddleware runs first to verify JWT and attach req.user
//   - getAllUsers controller handles the database query and returns the list
router.get('/users', authMiddleware, getAllUsers)

export default router  //* Exporting the router so it can be used in 'index.js' file