import jwt from 'jsonwebtoken'
import response from '../utils/responseHandler.js'

const authMiddleware = (req, res, next) => {

    const authToken = req.cookies?.auth_token;

    if (!authToken) {
        return response(res, 401, false, "Authorization token missing");
    }

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET not defined");
        }

        const decoded = jwt.verify(authToken, process.env.JWT_SECRET);

        req.user = decoded;

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
}

export default authMiddleware;