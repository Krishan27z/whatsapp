//! Importing create function from 'zustand' to make a global store [create() is used to create a global state store]
import {create} from 'zustand'

//! Importing 'persist' middleware to save 'store data' in localStorage
import {persist} from 'zustand/middleware'

/*
& ======== Layout Store =========
?  This store is used to manage UI-related state
?  Example:
?  - Which tab is active (chats, calls, status)
?  - Which contact is selected
*/
const useLayoutStore = create(
    persist(  //& Wrapping store with persist middleware
        (set) =>({
            activeTab: "chats",   //& Stores currently active tab. Default value is "chats"
            selectedContact: null, //& Currently selected contact (null when none selected)
            //? Function to update selected contact
            setSelectedContact: (contact) => set({selectedContact: contact}),
            //? Function to change active tab (chats, calls, status)
            setActiveTab: (tab) => set({activeTab: tab})
        }),
        {
            name: "layout-storage", //& Name of the storage key used in localStorage

            //? getStorage returns which storage to use (here: browser localStorage)
            //? This makes the store persistent across page reloads
            getStorage: () => localStorage
        }
    )
)

export default useLayoutStore