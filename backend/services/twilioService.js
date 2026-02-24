//! This file contains functions to interact with Twilio API for sending and verifying OTPs via SMS to the user's phone number.

import twilio from "twilio"
import dotenv from "dotenv"
dotenv.config()


const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const serviceSid = process.env.TWILIO_SERVICE_SID

//* 1. Initialize Twilio client
const client = twilio(accountSid, authToken)

//* 2. SEND OTP TO USER'S PHONE NUMBER USING TWILIO
const sendOtpToPhoneNumber = async (phoneNumber) => {
    try {
        console.log("Sending otp to this phone number", phoneNumber)
        if(!phoneNumber){
            throw new Error("Phone number is required")
        }
        const response = await client.verify.v2.services(serviceSid) //& client.verify.v2.services(serviceSid) → connects to your Twilio Verify service
            .verifications  //& Access the 'Twilio Verify service' using your unique "Service SID" 
            .create({   //& Access the 'verifications' resource under the Verify service (used to create or manage verification requests)
                to: phoneNumber,   //& Create a new verification request — this automatically generates and sends an OTP to the user
                channel: 'sms' //& The medium through which the OTP is sent — can be 'sms', 'call', or 'whatsapp'. [Here we use 'sms' to send OTP via text message]
            }) 
            console.log("Twilio OTP response is: ", response)
        return response
    } catch (error) {
        console.error("Error sending OTP via Twilio:", error)
        throw new Error("Failed to send OTP. Please try again later.")
    }
}

//* 3. VERIFY OTP ENTERED BY THE USER
const verifyOtp = async (phoneNumber, otp) => {
    try {
        console.log("This is the OTP to verify", otp)
        console.log("Verifying otp for this phone number", phoneNumber)
        const response = await client.verify.v2.services(serviceSid) //& client.verify.v2.services(serviceSid) → connects to your Twilio Verify service (the same one used while sending the OTP)
            .verificationChecks  //& Access the 'verificationChecks' resource under the Verify service - this is used to validate OTPs that users enter
            .create({   //& Create a new verification check — this verifies if the OTP entered by the user is valid
                to: phoneNumber,  //& The recipient’s phone number (must match the one used when sending the OTP)
                code: otp   //& The OTP code entered by the user — Twilio will compare it with the one previously sent
            })
        console.log("Twilio Verify OTP response is: ", response)
        return response 
    } catch (error) {
        console.error("Error verifying OTP via Twilio:", error)
        throw new Error("Failed to verify OTP. Please try again later.")
    }
}

export { sendOtpToPhoneNumber, verifyOtp }