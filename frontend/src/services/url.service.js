import axios from 'axios'

//! STEP 1: Get the base backend URL from .env
// ------------------------------------------
//& In your frontend, you cannot hardcode URLs because:
// 1️⃣ In development, backend might run on localhost:8000
// 2️⃣ In production, backend will be on your domain, e.g., https://api.whatsappclone.com
//& So we use an environment variable: REACT_APP_API_URL
// Create React App automatically replaces process.env.REACT_APP_* at build time
// Example in .env file: REACT_APP_API_URL = http://localhost:8000
//& Adding "/api" at the end because all our backend endpoints start with ---> /api

const apiUrl = `${import.meta.env.VITE_API_URL}/api`

const getToken = () => localStorage.getItem("auth_token")

//! STEP 2: Create an axios instance that all modules can import and use.
const axiosInstance = axios.create({
    baseURL: apiUrl,   //? baseURL: every request automatically starts with this URL
    //?  Example: axiosInstance.get('/chats') becomes http://localhost:8000/api/chats
    //?  Why useful? No need to type the full URL every time
    // withCredentials: true //? tells Axios to send cookies (or session tokens) along with requests
    //?  backend must allow it via CORS (Access-Control-Allow-Credentials: true)

})

axiosInstance.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    })

export default axiosInstance