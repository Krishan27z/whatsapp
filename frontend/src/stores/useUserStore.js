//! Importing create function from 'zustand' to make a global store
import {create} from 'zustand'

//! Importing 'persist' middleware to save store data in localStorage
import {persist} from 'zustand/middleware'

//& Creating a user store called 'useUserStore' to manage user data + login status
const useUserStore = create(
    persist(
        (set) =>({
            user: null,              //? Stores the currently logged-in user's data (null if no user)
            isAuthenticated: false,  //? Tracks if user is logged in or not

            //? setUser: saves user data and marks user as authenticated
            //? Example: setUser({ name: "John", phone: "12345" })
            setUser: (userData) => set({ user: userData, isAuthenticated: true }),

            //? `clearUser`: removes user data and marks user as not-authenticated/ logged out
            clearUser: () => set({user: null, isAuthenticated: false})
        }),
        {
            name: "user-storage", //& Name of the storage key used in localStorage

            //? getStorage returns which storage to use (here: browser localStorage)
            //? This makes the store persistent across page reloads
            getStorage: () => localStorage
        }
    )
)


export default useUserStore