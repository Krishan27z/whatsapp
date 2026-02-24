//! Importing create function from 'zustand' to make a global store
import {create} from 'zustand'

//! Importing 'persist' middleware to save store data in localStorage
import {persist} from 'zustand/middleware'

/*
&  Theme store (useThemeStore)
?  - Holds the current UI theme (e.g. 'light' or 'dark')
?  - Provides an action to change the theme
?  - Persists/saves/stores the theme in browser localStorage under the key "theme-storage"
*/
const useThemeStore = create(
    persist(
        (set) =>({
            theme: 'light',   //& current theme value (default is 'light')   
            setTheme: (theme) => set({ theme })  //& setTheme: update the theme value [dark or light]
        }),
        {
            name: "theme-storage", //& Name of the storage key used in localStorage

            //? getStorage returns which storage to use (here: browser localStorage)
            //? This makes the store persistent across page reloads
            getStorage: () => localStorage
        }
    )
)

export default useThemeStore