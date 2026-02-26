import jwt from 'jsonwebtoken'
import response from '../utils/responseHandler.js'

const authMiddleware = (req, res, next) => {
    let token = null;

    // 1️⃣ Try to get token from cookie
    if (req.cookies?.auth_token) {
        token = req.cookies.auth_token;
    }
    // 2️⃣ If no cookie, try Authorization header
    else {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    // 3️⃣ If no token found, return 401
    if (!token) {
        return response(res, 401, false, "Authorization token missing");
    }

    // 4️⃣ Verify token
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET not defined");
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user info to request
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return response(res, 401, false, "Token expired. Please login again.");
        }
        if (error.name === "JsonWebTokenError") {
            return response(res, 401, false, "Invalid token.");
        }
        return response(res, 401, false, "Authentication failed.");
    }
};

export default authMiddleware;