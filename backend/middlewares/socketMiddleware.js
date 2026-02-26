import jwt from 'jsonwebtoken'

const socketMiddleware = (socket, next) => {

    //^ Try to get token from multiple possible locations in the handshake
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers["authorization"]?.split(" ")[1] ||  
                  socket.handshake.query.token


    if (!token) {
        return next(new Error('Authentication error: Token missing'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); //^ Verify the token using the same secret key used for signing

        socket.user = decoded; //^ It contains user info like userId, email, etc. that we encoded in the token 
                        //^ during login/signup. We attach this info to the socket object for use in event handlers.

        next(); //^ It calls the next middleware or allows the connection to be established if this is the last middleware. If we pass an error to next(), it will reject the connection and send the error message to the client.

    } catch (error) {
        return next(new Error('Authentication error: Invalid token'));
    }
}

export default socketMiddleware;