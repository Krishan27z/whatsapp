import jwt from 'jsonwebtoken'
import response from '../utils/responseHandler.js'

const socketMiddleware = (socket, next) => {

    const token = socket.handshake.auth?.token || socket.handshake.headers["authorization"]?.split(" ")[1]

    
    if(token) {
        return next(new Error("Authorization token missing or malformed"));
    }

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET not defined");
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.user = decoded;

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

export default socketMiddleware;