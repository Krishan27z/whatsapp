import { useEffect, useState } from "react"
//~ Navigate → used to redirect user to another page
//~ Outlet → renders child routes
//~ useLocation → gives current URL info
import { Navigate, Outlet, useLocation } from "react-router-dom"
import useUserStore from "../stores/useUserStore"
import { checkUserAuth } from "../services/user.service"
import Loader from "../utils/Loader"


// ==================================================
//! 🔒 -------- PROTECTED ROUTE (We use it in "App.jsx" file) ---------
//^ This route is only accessible if user is logged in

export const ProtectedRoute = () => {
    const location = useLocation()   //~ Gets current page location (URL)
    const [isChecking, setIsChecking] = useState(true) //~ State to track whether auth check is still running
    const { isAuthenticated, setUser, clearUser } = useUserStore()

    useEffect(() => {
        //^ ------  Async function to verify authentication  ---------
        const verifyAuth = async () => {
            try {
                const result = await checkUserAuth()  //~ Call backend API to check if user is authenticated (login status)

                if (result?.isAuthenticated) { //& If backend says user is authenticated, then save user data in global store
                    setUser(result.user)  //&  Save user data in global store
                }
                else {
                    clearUser() //& If user is NOT authenticated, then remove user data from global store [User LogOut]
                }
            } catch (error) {
                console.log(error)
                clearUser()
            }
            finally {
                setIsChecking(false)  //&  Stop loader after auth check completes
            }
        }
        //^ -------  Call the auth verification function  ---------
        verifyAuth()
    }, [setUser, clearUser])

    //^  --------- While checking authentication → show loader  ---------
    if (isChecking) {
        return <Loader />
    }
    //^ ---------  If user is NOT logged in → redirect to login page  ----------
    if (!isAuthenticated) {
        return <Navigate to="/user-login" state={{ from: location }} replace />
    }

    //^ ------- If user IS authenticated [i.e., User is Logged-In] ----------
    //~ Then 'Outlet' will render the child component of this route
    //~ [Example: Home page, UserDetails Page etc.]
    return <Outlet />
}

//! ===================== PUBLIC ROUTE (We use it in "App.jsx" file) =====================
//~ This route is for login / signup pages
//~ Logged-in users should NOT access these pages

export const PublicRoute = () => {
    const isAuthenticated = useUserStore(state => state.isAuthenticated)  //& Get authentication status from store
    if (isAuthenticated) {
        return <Navigate to='/' replace />  //&  If user is already logged in → redirect to home page
    }
    return <Outlet />  //&  If user is NOT logged in → then
                      //&   Outlet renders the public child route [Example: Login page]
}