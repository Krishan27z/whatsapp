import jwt from 'jsonwebtoken'

//^ Function to generate a JWT token for a given user ID
const generateToken = (userId) => {  //? This function 'generateToken' is called in authController.js file in STEP:2️⃣.3) GENERATE AUTH TOKEN (JWT) AND SET IT IN COOKIE
    
    //& The method "jwt.sign(payload, secretKey, options)" creates (signs) a JWT token — basically, a secure digital “proof of identity” for a user.
    //~ Create (sign) a token using the user's ID as payload
    //~ - process.env.JWT_SECRET → secret key used to encrypt the token (stored in your .env file)
    //~ - expiresIn: '1y' → token will expire in 1 year
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1y' })
}

export default generateToken //? Export the function so it can be used in authController.js file