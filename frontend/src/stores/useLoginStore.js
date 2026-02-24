//! Importing create function from 'zustand' to make a global store
import {create} from 'zustand'

//! Importing 'persist' middleware to save store data in localStorage
import {persist} from 'zustand/middleware'

//& Creating a login store to manage login steps and user phone data
const useLoginStore = create(
    persist(
        (set) =>({
            step:1, //? step keeps track of which step in login process we are
            userPhoneData: null, //? userPhoneData will store the phone info entered by the user
            setStep: (step) => set({ step }), //? setStep updates the current step value
            setUserPhoneData: (data) => set({userPhoneData: data}),  //? setUserPhoneData updates the phone data
            resetLoginState: () => set({step:1, userPhoneData:null})  //? resetLoginState resets everything to initial state
        }),
        {
            name: "login-storage",   //& Name of the localStorage key
            partialize: (state) =>({ //? partialize decides which parts of state to persist/save in local storage.
                                  //? We only save `step` and `userPhoneData` so other transient fields (if added later) won't be stored automatically.
                step: state.step,
                userPhoneData: state.userPhoneData
            })
        }
    )
)

export default useLoginStore