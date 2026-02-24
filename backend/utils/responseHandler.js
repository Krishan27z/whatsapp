//! This file defines a utility function to send consistent HTTP responses from the server to the client.

/*
  ✅ response(): =>
 * A reusable function to standardize how the backend sends responses.
 * Ensures that both success and error responses follow the same JSON structure.
 * This makes it easier for the frontend to handle responses uniformly.
 */

const response = (res, statusCode, success, message, data = null) => { //& These parameters are passed from the controller functions (like authController.js, userController.js, etc.)
    if(!res){
        console.error("Response object is missing/ null");
        return
    }
    //^ We have to send a consistent response structure for both success and error cases to the client 
    const responseObject = {
        status: statusCode < 400 ? "success" : "error",
        message,
        data
    }
    // ^ Send the HTTP response to the client
    // - status(statusCode) sets the HTTP status code (e.g., 200, 404, 500)
    // - json(responseObject) sends the response in JSON format
    return res.status(statusCode).json(responseObject)
}

export default response