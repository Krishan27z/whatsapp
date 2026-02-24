//!  This file generates a random 6-digit OTP (One-Time Password) for user verification purposes.

const otpGenerator = () => {
    const otp = Math.floor(100000 + Math.random() * 900000); //~ Generates a random 6-digit number
    return otp.toString(); //~ Return OTP as a string
}

export default otpGenerator