import React, { useState, useEffect } from 'react'
import useLoginStore from '../../stores/useLoginStore.js'
import useUserStore from '../../stores/useUserStore.js'
import useThemeStore from '../../stores/useThemeStore.js'
import Countries from '../../utils/Countries.js'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import { motion } from 'framer-motion'
import { FaArrowLeft, FaChevronDown, FaWhatsapp, FaPlus, FaUser, FaRedo } from 'react-icons/fa'
import Spinner from '../../utils/Spinner'
import { sendOtp, verifyOtp, updateUserProfile } from '../../services/user.service.js'

//! [1] VALIDATION SCHEMA ----> for login form using yup
const loginValidationSchema = yup
    .object() //& Defines that our validation is for an object (form data)
    .shape({
        //^ [1.1] <-------- Phone Number Validation ------------->
        phoneNumber: yup
            .string() //? phoneNumber must be a string
            .transform((value, originalValue) => {
                return originalValue.trim() === "" ? null : value  //? Convert empty string ("") to null [If user enters nothing → "" , We convert "" into null. Yup now handles it properly]
            })
            .nullable() //? Allows null value
            .matches(
                /^\d{10}$/, {
                message: "Phone number must be 10 digits",
                excludeEmptyString: true, //& Only validate if user typed something
            }
            ),

        //^ [1.2] <-------- Email Validation ------------->
        email: yup
            .string() //? email must be a string
            .transform((value, originalValue) =>
                originalValue.trim() === "" ? null : value  //? Convert empty string ("") to null [If user enters nothing → "" , We convert "" into null. Yup now handles it properly]
            )
            .nullable() //? Allows null value
            .email('Please enter a valid email address') //? Checks email format
    }).test(    //& .test() is used to create a custom validation rule. Bcz, .required() alone cannot check multiple fields
        "at-least-one", //? This is the name of the validation rule. Used internally by 'Yup' to identify this test.
        "Either Email or Phone Number is required", //& This is the error message shown to the user. It appears when this validation fails.
        function (value) {
            const { phoneNumber, email } = value || {}
            if (!phoneNumber && !email) {
                return this.createError({
                    path: "root",   //* 👈 FORM-LEVEL ERROR
                    message: "Either Email or Phone Number is required",
                })
            }
            return true
        }
    )


//! [2] OTP Validation Schema 
const otpValidationSchema = yup
    .object()
    .shape({
        otp: yup
            .string()   //& OTP is handled as string to preserve leading zeros
            .matches(/^[0-9]{6}$/, "Otp must be exactly 6 digits")  //& Ensures OTP contains ONLY 6 digits (0–9)
            .required("OTP is required") //& OTP cannot be empty
    })


//! [3] Profile Validation Schema 
const profileValidationSchema = yup
    .object()
    .shape({
        username: yup
            .string()
            .required("Username is required"),
        agreed: yup
            .boolean()
            //? Defines that "agreed" must be a boolean value (true or false)
            //? Used for checkbox inputs (checked = true, unchecked = false)

            .oneOf([true], "You must agree to the terms")
        //? Allows ONLY the value `true`
        //? If checkbox is not checked (false), validation fails. 
        //? Error message (i.e., "You must agree to the terms") shown when user does not agree means the checkbox is false.
    })


//! [4] ----------- AVATARS --------------
const avatars = [
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Mimi',
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Jasper',
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/6.x/avataaars/svg?seed=Zoe',
]


function Login() {
    const { step, setStep, userPhoneData, setUserPhoneData, resetLoginState } = useLoginStore() //& step:- Current step in login flow (login → otp → profile)
    const [phoneNumber, setPhoneNumber] = useState("")  //&  Stores phone/email data entered by user
    const [selectedCountry, setSelectedCountry] = useState(Countries[0])  //& select the 1st Country from the list 'Countries'
    const [otp, setOtp] = useState(["", "", "", "", "", ""])
    const [email, setEmail] = useState("")
    const [profilePicture, setProfilePicture] = useState(null)
    const [selectedAvatar, setSelectedAvatar] = useState(avatars[0])  //& select the 1st Avatar from the list 'avatars'
    const [profilePictureFile, setProfilePictureFile] = useState(null)
    const [error, setError] = useState("")
    const navigate = useNavigate()   //&  Navigation hook to move between routes
    const { setUser } = useUserStore()  //&  Getting setUser function from user store
    const { theme, setTheme } = useThemeStore()
    const [dropDown, setDropDown] = useState(false) //& State to control whether the dropdown menu of countries is open or closed
    const [searchTerm, setSearchTerm] = useState("") //& State to store the user's search input for filtering countries in the dropdown
    const [loading, setLoading] = useState(false)

    // 🔴 TIMER STATES (NEWLY ADDED)
    const [timer, setTimer] = useState(() => {
        // 🔴 Check localStorage for saved timer
        const savedTimerData = localStorage.getItem('otpTimerData');
        if (savedTimerData) {
            const { expiryTime, step: savedStep } = JSON.parse(savedTimerData);
            // Check if we're still in step 2
            if (savedStep === 2) {
                const now = Date.now();
                const remainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));
                return remainingSeconds > 0 ? remainingSeconds : 0;
            }
        }
        return 300; // Default 5 minutes
    });
    const [isTimerActive, setIsTimerActive] = useState(() => {
        // Check if timer should be active
        const savedTimerData = localStorage.getItem('otpTimerData');
        if (savedTimerData) {
            const { expiryTime, step: savedStep } = JSON.parse(savedTimerData);
            if (savedStep === 2) {
                const now = Date.now();
                return expiryTime > now;
            }
        }
        return false;
    });
    const [canResend, setCanResend] = useState(() => {
        const savedTimerData = localStorage.getItem('otpTimerData');
        if (savedTimerData) {
            const { expiryTime, step: savedStep } = JSON.parse(savedTimerData);
            if (savedStep === 2) {
                const now = Date.now();
                return expiryTime <= now;
            }
        }
        return false;
    });



    //^ [1]  -------- Login Form (Email / Phone) --------
    //? M-1: (Type: Destructing)
    //* loginRegister = renamed register, handleLoginSubmit = renamed handleSubmit. They are returned by useForm() hook, not from any file.
    //& The below is written in destructing form. We can write the following in other 2 ways also.
    const {
        register: loginRegister,
        handleSubmit: handleLoginSubmit,
        formState: { errors: loginErrors }
    } = useForm({
        resolver: yupResolver(loginValidationSchema)
    })
    //? M-2: (Type: Partial Destructing)
    // const loginForm = useForm({
    //     resolver: yupResolver(loginValidationSchema)
    // })

    // const { register: loginRegister, handleSubmit: handleLoginSubmit } = loginForm
    // const loginErrors = loginForm.formState.errors

    //? M-3: (Type: No Destructing)
    // const loginForm = useForm({
    //     resolver: yupResolver(loginValidationSchema)
    // })

    // const loginRegister = loginForm.register
    // const handleLoginSubmit = loginForm.handleSubmit
    // const loginErrors = loginForm.formState.errors


    //^ [2]  -------- OTP Form --------
    const {
        handleSubmit: handleOtpSubmit,
        formState: { errors: otpErrors },
        setValue: setOtpValue
    } = useForm({
        resolver: yupResolver(otpValidationSchema)  //! 'otpValidationSchema' comes from above [step-2]
    })

    //^ [3]  -------- Profile Form --------
    const {
        register: profileRegister,
        handleSubmit: handleProfileSubmit,
        formState: { errors: profileErrors },
        watch
    } = useForm({
        resolver: yupResolver(profileValidationSchema)
    })

    //^ [4]   ---------- Progress Bar ---------
    const ProgressBar = () => (
        <div className={`w-full ${theme === 'dark' ? "bg-gray-700" : "bg-gray-200"} rounded-full h-2.5 mb-6`}>
            <div className='bg-green-500 h-2.5 rounded-full transition-all duration-500 ease-in-out'
                style={{ width: `${(step / 3) * 100}%` }}
            >
            </div>
        </div>
    )

    // 🔴 FORMAT TIMER TO MM:SS (NEWLY ADDED)
    const formatTimer = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // 🔴 SAVE TIMER TO LOCALSTORAGE (NEWLY ADDED)
    const saveTimerToLocalStorage = (seconds) => {
        const expiryTime = Date.now() + (seconds * 1000);
        localStorage.setItem('otpTimerData', JSON.stringify({
            expiryTime,
            step: 2,
            timestamp: Date.now()
        }));
    }

    // 🔴 CLEAR TIMER FROM LOCALSTORAGE (NEWLY ADDED)
    const clearTimerFromLocalStorage = () => {
        localStorage.removeItem('otpTimerData');
    }

    // 🔴 RESEND OTP FUNCTION (NEWLY ADDED)
    const handleResendOtp = async () => {
        try {
            setLoading(true)
            let response

            if (userPhoneData?.email) {
                response = await sendOtp(null, null, userPhoneData.email)
            } else if (userPhoneData?.phoneNumber && userPhoneData?.phoneSuffix) {
                response = await sendOtp(userPhoneData.phoneNumber, userPhoneData.phoneSuffix, null)
            }

            if (response?.status === "success") {
                toast.success("New OTP sent successfully")
                // Reset timer
                const newTimer = 300;
                setTimer(newTimer)
                setIsTimerActive(true)
                setCanResend(false)
                // Save to localStorage
                saveTimerToLocalStorage(newTimer)
                // Reset OTP fields
                setOtp(["", "", "", "", "", ""])
                setOtpValue("otp", "")
            } else {
                toast.error(response?.message || "Failed to resend OTP")
            }
        } catch (error) {
            console.error("Resend OTP Error:", error)
            toast.error("Failed to resend OTP")
        } finally {
            setLoading(false)
        }
    }

    // 🔴 TIMER EFFECT (NEWLY ADDED) - PERSISTENT
    useEffect(() => {
        let intervalId

        if (step === 2 && isTimerActive && timer > 0) {
            intervalId = setInterval(() => {
                setTimer(prev => {
                    if (prev <= 1) {
                        setIsTimerActive(false)
                        setCanResend(true)
                        clearTimerFromLocalStorage()
                        return 0
                    }
                    const newTime = prev - 1;
                    // Update localStorage every 5 seconds (not every second for performance)
                    if (newTime % 5 === 0) {
                        saveTimerToLocalStorage(newTime)
                    }
                    return newTime
                })
            }, 1000)
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId)
            }
        }
    }, [step, isTimerActive, timer])

    // 🔴 SYNC TIMER WITH LOCALSTORAGE ON MOUNT (NEWLY ADDED)
    useEffect(() => {
        // Check if timer data exists in localStorage
        const savedTimerData = localStorage.getItem('otpTimerData');
        if (savedTimerData) {
            const { expiryTime, step: savedStep } = JSON.parse(savedTimerData);

            if (savedStep === 2 && step === 2) {
                const now = Date.now();
                const remainingSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));

                setTimer(remainingSeconds);

                if (remainingSeconds > 0) {
                    setIsTimerActive(true);
                    setCanResend(false);
                } else {
                    setIsTimerActive(false);
                    setCanResend(true);
                }
            }
        }

        // Cleanup on component unmount
        return () => {
            // Don't clear here, we want it to persist
        };
    }, [step]);

    // 🔴 SAVE TIMER WHEN SENDING OTP (NEWLY ADDED)
    useEffect(() => {
        if (step === 2 && timer === 300) {
            // This means OTP was just sent
            saveTimerToLocalStorage(timer);
            setIsTimerActive(true);
            setCanResend(false);
        }
    }, [step, timer]);

    //^  [5] ----------- DROPDOWN MENU for all Countries --------------
    //~ Filter the list of countries based on the searchTerm entered by the user.
    //~ The filter will match if:
    //~   1. The country's name (case-insensitive) includes the searchTerm, OR
    //~   2. The country's dial code includes the searchTerm
    const filterCountries = Countries.filter(
        (country) => (
            country.name.toLowerCase().includes(searchTerm.toLowerCase()) || country.dialCode.includes(searchTerm)
        )
    )


    //^  [6] --------- LOGIN API call (Email / Phone based OTP) ----------
    const onLoginSubmit = async (data) => {   //? react-hook-form sends values inside data
        try {
            setLoading(true) //& Show spinner during API call

            const { phoneNumber, email } = data //& Get values of data from react-hook-form

            //* ---- Case 1: Login via Email ----
            //^ IMPORTANT: Check email explicitly (not truthy check)
            if (email && email.trim() !== "") {

                const response = await sendOtp(
                    null,   //& phoneNumber is null
                    null,   //& phoneSuffix is null
                    email   //& Email is sent
                )
                if (response?.status === "success") {
                    toast.success("OTP sent to your email")
                    setUserPhoneData({ email }) //& Store email for OTP verification step
                    // 🔴 RESET TIMER TO 5 MINUTES
                    setTimer(300);
                    setIsTimerActive(true);
                    setCanResend(false);
                    saveTimerToLocalStorage(300);
                    setStep(2) //& ✅ Move to OTP screen
                } else {
                    toast.error(response?.message || "Failed to send OTP")
                }

            }
            //* ---- Case 2: Login via Phone Number ----
            else if (phoneNumber && phoneNumber.trim() !== "") {

                const response = await sendOtp(
                    phoneNumber,                  //& Send ONLY 10-digit phone number
                    selectedCountry.dialCode,     //& Send country code separately
                    null                           //& Email is null
                )
                if (response?.status === "success") {
                    toast.success("OTP sent to your phone number")
                    setUserPhoneData({             //& Store phone data for OTP verification step
                        phoneNumber,
                        phoneSuffix: selectedCountry.dialCode
                    })
                    // 🔴 RESET TIMER TO 5 MINUTES
                    setTimer(300);
                    setIsTimerActive(true);
                    setCanResend(false);
                    saveTimerToLocalStorage(300);
                    setStep(2) //& ✅ Move to OTP screen
                } else {
                    toast.error(response?.message || "Failed to send OTP")
                }
            }
        } catch (error) {
            console.error("Login OTP Error:", error)
            toast.error("Failed to send OTP")
        } finally {
            setLoading(false) //& Hide spinner
        }
    }



    //^  [7] --------- Verify OTP (received via Email / Phone) ----------
    const onOtpSubmit = async () => {
        try {
            setLoading(true)  //& Show spinner while OTP verification API is running

            // 🔴 CHECK TIMER (NEWLY ADDED)
            if (timer <= 0) {
                toast.error("OTP has expired. Please request a new one.")
                return
            }

            if (!userPhoneData) {   //&  Value in 'userPhoneData' comes from [6] LOGIN API call (Email / Phone based OTP) 
                throw new Error("Phone or Email data is missing")
            }

            // 🔴 VALIDATE OTP FORMAT (NEWLY ADDED)
            const otpString = otp.join("")  //& 'otp' comes from above in this file (useState hook)
            if (otpString.length !== 6) {
                toast.error("Please enter a 6-digit OTP")
                return
            }

            let response
            //* ---- Case 1: OTP verification via Email ----
            if (userPhoneData?.email) {
                response = await verifyOtp(null, null, otpString, userPhoneData.email) //& From "user.service.js" file --> async (phoneNumber, phoneSuffix, otp, email)
            }
            //* ---- Case 2: OTP verification via Phone ----
            else {
                response = await verifyOtp(userPhoneData.phoneNumber, userPhoneData.phoneSuffix, otpString, null)//& From "user.service.js" file --> async (phoneNumber, phoneSuffix, otp, email)
            }
            //& <===== If backend confirms OTP verification success =======>
            if (response?.status === "success") {
                toast.success("OTP is verified successfully")
                const token = response.data?.token  //^ Get token from response (if sent by backend)
                localStorage.setItem("auth_token", token)  //^ Save token to localStorage for future authenticated requests
                console.log(response)  //^ <--- to see the logged-in user's details in console 
                const user = response.data?.user

                //& If user profile is already complete → direct login
                if (user?.username && user?.profilePicture) {
                    setUser(user)   //~ Save user to global store / state
                    toast.success("Welcome to WhatsApp")
                    navigate('/')    //~ Redirect to home
                    resetLoginState()  //~ Redirect to home
                    // 🔴 CLEAR TIMER FROM LOCALSTORAGE
                    clearTimerFromLocalStorage();
                }
                //& If profile is incomplete → move to profile setup step (step-3)
                else {
                    setStep(3)
                    // 🔴 CLEAR TIMER FROM LOCALSTORAGE
                    clearTimerFromLocalStorage();
                }
            } else {
                // 🔴 SHOW SPECIFIC ERROR FROM BACKEND (NEWLY ADDED)
                const errorMessage = response?.message || "Invalid OTP"

                if (errorMessage.includes("Invalid") || errorMessage.includes("incorrect")) {
                    toast.error("Incorrect OTP. Please try again.")
                } else if (errorMessage.includes("expired")) {
                    toast.error("OTP has expired. Please request a new one.")
                    setCanResend(true)
                } else {
                    toast.error(errorMessage)
                }
            }
        } catch (error) {
            console.error("Login OTP Error:", error)

            // 🔴 HANDLE NETWORK ERRORS (NEWLY ADDED)
            if (error.response) {
                const errorData = error.response.data
                if (errorData.message) {
                    toast.error(errorData.message)
                } else if (errorData.includes("Invalid OTP")) {
                    toast.error("Incorrect OTP. Please check and try again.")
                } else {
                    toast.error("Failed to verify OTP. Please try again.")
                }
            } else if (error.request) {
                toast.error("Network error. Please check your connection.")
            } else {
                toast.error("Incorrect OTP!!!")
            }
        } finally {
            setLoading(false) //& Hide Spinner after API finishes
        }
    }


    //^  [8] Handle profile picture selection (triggered when user chooses a file)
    const handleFileChange = async (e) => {
        const file = e.target.files[0];

        if (!file) return;

        const isHeic = file.type === 'image/heic' ||
            file.type === 'image/heif' ||
            file.name.toLowerCase().endsWith('.heic') ||
            file.name.toLowerCase().endsWith('.heif');

        if (!isHeic) {
            // For non-HEIC, use as is
            setProfilePictureFile(file);
            setProfilePicture(URL.createObjectURL(file));
            return;
        }

        // For HEIC, try to load and convert using canvas
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (event) => {
            img.onload = () => {
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Convert to JPEG blob
                canvas.toBlob((blob) => {
                    if (!blob) {
                        toast.error("Failed to convert HEIC image");
                        return;
                    }

                    const convertedFile = new File(
                        [blob],
                        file.name.replace(/\.(heic|heif)$/i, '.jpg'),
                        { type: 'image/jpeg' }
                    );

                    setProfilePictureFile(convertedFile);
                    setProfilePicture(URL.createObjectURL(convertedFile));
                    toast.success("HEIC converted to JPEG successfully");
                }, 'image/jpeg', 0.9);
            };

            img.onerror = () => {
                toast.error("Failed to load HEIC image. Please use JPEG or PNG.");
                e.target.value = '';
            };

            img.src = event.target.result;
        };

        reader.onerror = () => {
            toast.error("Failed to read file");
            e.target.value = '';
        };

        reader.readAsDataURL(file);
    }


    //^  [9] ----- Update User Profile (Username + Avatar / Image) -------- [read authController.js (BACKEND) for better understanding how this part works with backend]
    const onProfileSubmit = async (data) => {  //~ `data` contains all form values collected by react-hook-form (username, checkbox, etc.)
        try {
            setLoading(true)   //& Show spinner while profile update API runs
            const formData = new FormData() //~ Create FormData OBJECT because we are sending file (profile picture) + text (username, agreed) together to the backend (API)

            //& Add username value to FormData
            //& Backend will read this as:- req.body.username
            formData.append("username", data.username)

            //& Add checkbox value (true / false) to FormData
            //& Backend will read this as:- req.body.agreed
            formData.append("agreed", data.agreed)

            //* ---- Case 1: User uploaded a custom profile picture ----
            if (profilePictureFile) {
                //~ Add image file to FormData
                //~ Backend will receive this in: req.file
                //~ 'media' key is used by backend (Cloudinary config)
                formData.append("media", profilePictureFile) //! 'media' comes from the BACKEND --> config/cloudinaryConfig.js file
            }
            //* ---- Case 2: User selected a default avatar ----
            else {
                //~ Send avatar image URL instead of file
                //~ Backend receives this as req.body.profilePicture
                formData.append("profilePicture", selectedAvatar)
            }
            //& ------ Call Update Profile API ------
            const response = await updateUserProfile(formData) //^ Call the API function to update user profile (defined in "user.service.js" file)

            if (response?.status === "success") {
                const updatedUser = response.data?.user
                setUser(updatedUser)  //~ Save updated user to global store / state
                toast.success("Welcome to the WhatsApp")
                navigate('/')     //~ Redirect to home
                resetLoginState() //~ Clear all login-related states
                clearTimerFromLocalStorage(); //~ CLEAR TIMER FROM LOCALSTORAGE
            }
        } catch (error) {
            console.error("Login OTP Error:", error);
            toast.error("Failed to update user profile");
        } finally {
            setLoading(false); //& Hide Spinner after API finishes
        }
    }


    //^  [10] -------- Handle OTP input change (forward movement) [Manual Typing + Paste] --------
    //^ -------- Handle OTP Change (Typing + Paste) --------
    const handleOtpChange = async (index, value) => {
        const newOtp = [...otp] //& Make a copy of current OTP state

        //===================================================
        // 🟢 CASE-1: USER PASTES OTP (Ctrl + V)
        //===================================================
        //? When user pastes, value length will be > 1
        if (value.length > 1) {

            //& Keep only numbers & limit to 6 digits
            const pastedOtp = value.replace(/\D/g, "").slice(0, 6)

            //& Convert pasted OTP into array
            const otpArray = pastedOtp.split("")

            //& Fill remaining boxes with empty strings if less than 6
            while (otpArray.length < 6) {
                otpArray.push("")
            }

            //& Update OTP state
            setOtp(otpArray)

            //& Sync with react-hook-form
            setOtpValue("otp", otpArray.join(""))

            //& Focus last filled OTP box i.e., INDEX-5 (since there're 6 otp boxes)
            document.getElementById(otp - 5)?.focus()

            return
        }

        //===================================================
        // 🟢 CASE-2: USER TYPES OTP MANUALLY (ONE DIGIT)
        //===================================================
        //? Allow only numbers (0–9)
        if (!/^\d?$/.test(value)) return

        //& Set the digit at current index
        newOtp[index] = value

        //& Update OTP state
        setOtp(newOtp)

        //& Sync with react-hook-form
        setOtpValue("otp", newOtp.join(""))

        //& Auto-focus next OTP box
        if (value && index < 5) {
            document.getElementById(`otp-${index + 1}`)?.focus()
        }
    }



    //^  [11] ------ Handle BACKSPACE navigation in OTP inputs (backward Delete) ------
    const handleOtpKeyDown = (index, e) => {
        if (e.key === "Backspace") {
            e.preventDefault()  //&  Stop browser's default backspace behavior
            const newOtp = [...otp]

            //? If current box has value → clear it. If current box is empty then goto 'else-if' condition
            //& This condition will true only for "last index" i.e., [index-5]. BCZ, initially index-5 has digit.
            if (newOtp[index]) {
                newOtp[index] = ""
            }
            //? If empty → move back & clear previous box
            else if (index > 0) {
                newOtp[index - 1] = ""
                document.getElementById(`otp-${index - 1}`)?.focus()
            }

            //& Update OTP state
            setOtp(newOtp)

            //& Sync with react-hook-form
            setOtpValue("otp", newOtp.join(""))
        }
    }



    //^  [12] ------ Handle "Back" action from OTP screen ------
    const handleBack = () => {
        setStep(1)   //& Navigate user back to Step 1 (Phone / Email input screen)
        setUserPhoneData(null) //& Clear the stored phone/email data (used for OTP verification)
        setOtp(["", "", "", "", "", ""])  //& Reset OTP inputs to empty state
        setError("")  //& Clear any existing error messages
        // 🔴 CLEAR TIMER FROM LOCALSTORAGE
        clearTimerFromLocalStorage();
        setTimer(300);
        setIsTimerActive(false);
        setCanResend(false);
    }




    return (
        //! Full page container
        <div className={`min-h-screen ${theme === 'dark' ? "bg-gray-900" : "bg-gradient-to-tl from-green-500 via-cyan-400 to-blue-500"} flex items-center justify-center p-4 overflow-hidden`}>
            {/*//^  Card container with fade/slide animation */}
            <motion.div
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={`${theme === 'dark' ? "bg-gray-800 text-white" : "bg-white"} p-6 md:p-8 rounded-lg shadow-2xl w-full max-w-md relative z-10`}
            >
                {/*//& [1] WhatsApp logo animation  */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, type: 'spring', stiffness: 260, damping: 20 }} //^ Spring animation (bouncy), stiffness => Speed of spring, damping => Bounce control
                    className="w-16 h-16 sm:w-24 sm:h-24 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center"
                >
                    {/*//~  WhatsApp icon  */}
                    <FaWhatsapp
                        className="
                            w-10 h-10          //! 📱 mobile
                            sm:w-12 sm:h-12    //! 📱➡️ tablet
                            md:w-14 md:h-14    //! 💻 laptop
                            lg:w-16 lg:h-16    //! 🖥️ desktop
                         text-white
                        "
                    />
                </motion.div>

                {/*//& [2] Login heading */}
                <h1 className={`text-3xl font-bold text-center mb-6 ${theme === "dark" ? "text-white" : "text-gray-800"}`}>
                    WhatsApp Login
                </h1>

                {/*//& [3] Progress Bar  */}
                <ProgressBar />   {/*//? It's defined in this same file before 'return' */}

                {/*//& [4] If any error occurs then show the following  */}
                {error && <p className='text-red-500 text-center mb-4'>{error}</p>}


                {/*//! [5] Phone number input form with country dropdown  */}
                {step === 1 && (
                    <form className='space-y-4' onSubmit={handleLoginSubmit(onLoginSubmit)}>
                        <p className={` text-center text-base sm:text-[1.12rem] mb-5
                            ${theme === 'dark' ? "text-gray-300" : "text-gray-700"}`}
                        >
                            Enter your phone number to receive an OTP
                        </p>

                        <div className='relative'>
                            <div className='flex'>
                                <div className='relative w-1/3'>
                                    <button
                                        type='button' //&  <-- Prevents from submitting the form
                                        className={`flex-shrink-0 z-10 inline-flex items-center gap-1 px-2 py-2 sm:px-4 sm:py-2.5 text-sm font-medium text-center whitespace-nowrap 
                                        ${theme === 'dark'
                                                ? "text-white bg-gray-700 border-gray-600 hover:bg-gray-600 focus:ring-gray-500"
                                                : "text-gray-900 bg-gray-100 border-gray-300 hover:bg-gray-200 focus:ring-gray-100"} 
                                        border rounded-s-lg focus:ring-4 focus:outline-none cursor-pointer`}
                                        onClick={() => setDropDown(!dropDown)}
                                    >
                                        <span>
                                            <span className={`fi fi-${selectedCountry.code} w-5 h-4`}></span> {selectedCountry.dialCode}
                                        </span>
                                        <FaChevronDown className='ml-2' />
                                    </button>

                                    {/*//^ ------- Dropdown menu ------- */}
                                    {dropDown && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className={`absolute z-30 sm:w-72 w-[16rem] top-full mt-1 -translate-y-24 max-h-64 overflow-y-auto
                                            ${theme === 'dark' ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300 text-gray-800"} border rounded-md shadow-2xl`}
                                        >
                                            {/*//^ ----- Search input container ----- */}
                                            <div className={`sticky top-0 bg-inherit z-10 p-2
                                            ${theme === 'dark' ? "bg-gray-700" : "bg-white"}`}
                                            >
                                                <input
                                                    type='text'
                                                    placeholder='Search Countries....'
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                    //& Select the first filtered country on 'Enter key'
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && filterCountries.length > 0) {
                                                            setSelectedCountry(filterCountries[0]);
                                                            setDropDown(false); //&  CLOSE the Dropdown-Menu 
                                                            setSearchTerm(""); //& CLEAR search input after selection
                                                        }
                                                    }}
                                                    className={`w-full px-2 py-1 border rounded-md text-base focus:outline-none focus:ring-2 focus: ring-green-500
                                                    ${theme === 'dark'
                                                            ? "bg-gray-800 border-gray-500 text-white"
                                                            : "bg-white border-gray-300 text-gray-900 font-semibold"}`}
                                                />
                                            </div>
                                            {/*//^ ------- List of filtered countries ------- */}
                                            <div className={`overflow-auto max-h-52 mt-0 w-[15rem] sm:w-full
                                                ${theme === 'dark' ? "bg-gray-700" : "bg-green-50"}`}>
                                                {filterCountries.map((country) => (
                                                    <button
                                                        key={country.alpha2} //& UNIQUE KEY for each country
                                                        type='button'  //&  <-- Prevents from submitting the form
                                                        className={`w-full text-left px-1 py-2 cursor-pointer
                                                    ${theme === 'dark' ? "hover:bg-gray-600" : "hover:bg-gray-200"} focus:outline-none`}
                                                        onClick={() => {
                                                            setSelectedCountry(country)
                                                            setDropDown(false)
                                                        }}
                                                    >
                                                        <span className={`fi fi-${country.code} w-5 h-4 mr-2`}></span>
                                                        ({country.dialCode}) {country.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                {/* //^ -------- Phone Number Input Box ---------- */}
                                <input
                                    type='text'
                                    placeholder='Phone Number'
                                    value={phoneNumber}
                                    //& Connects this input to react-hook-form using 'register'
                                    //& 'loginRegister' is just a renamed version of 'register' returned by useForm()
                                    {...loginRegister("phoneNumber")}
                                    onChange={(e) => { setPhoneNumber(e.target.value) }}
                                    className={`w-2/3 px-2 py-1.5 sm:px-4 sm:py-2 border 
                                    ${theme === 'dark'
                                            ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-300"
                                            : "bg-white border-gray-300 text-gray-800 placeholder:text-gray-400 text-base"}
                                    rounded-tr-md rounded-br-md focus:outline-none focus:ring-2 focus: ring-green-500 text-center 
                                    ${loginErrors.phoneNumber ? "border-red-500" : ""}`}
                                />
                            </div>
                            {/* //^ -------- Validation Error Message (ONLY phone errors) -------- */}
                            {loginErrors.phoneNumber && (
                                <p className='text-red-500'>{loginErrors.phoneNumber.message}</p> //& Shows Yup validation error message if phone number is invalid
                            )}
                        </div>
                        {/*//^  ------- Divider with 'or' --------  */}
                        <div className='flex items-center my-4'>
                            <div className='flex-grow h-px bg-gray-400' />
                            <span className={`mx-3 text-sm sm:text-[1.03rem] font-medium
                                ${theme === 'dark' ? "text-gray-400 " : "text-gray-600 "}`}>
                                or
                            </span>
                            <div className='flex-grow h-px bg-gray-400' />
                        </div>

                        {/*//^ 🔥 FORM-LEVEL ERROR (Either Phone or Email) */}
                        {loginErrors?.root && (
                            <p className="text-red-500 text-center mt-2">
                                {loginErrors.root.message}
                            </p>
                        )}

                        {/* //^ -------- Email Input Box ---------- */}
                        <div className={`flex items-center border rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500
                            ${theme === 'dark' ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300"}`}
                        >
                            <FaUser className={`mr-2 text-gray-400 
                                    ${theme === 'dark' ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-500"}`}
                            />
                            <input
                                type='email'
                                placeholder='Email (optional)'

                                //& Connects this input to react-hook-form using 'register'
                                //& 'loginRegister' is just a renamed version of 'register' returned by useForm()
                                {...loginRegister("email")}

                                className={`w-full bg-transparent focus:outline-none border-none 
                                ${theme === 'dark'
                                        ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-300"
                                        : "bg-white border-gray-300 text-gray-700 placeholder:text-gray-400 text-base"}
                                ${loginErrors.email ? "border-red-500" : ""}`}
                            />
                            {/* //^ -------- Validation Error Message (ONLY email errors) -------- */}
                            {loginErrors.email && (
                                <p className='text-red-500'>{loginErrors.email.message}</p> //& Shows Yup validation error message if phone number is invalid
                            )}
                        </div>
                        {/*//^ Submit button to Sned OTP */}
                        <button type='submit'
                            className='w-full text-base sm:text-[18px] bg-green-500 text-white 
                                py-2 rounded-md hover:bg-green-600 transition cursor-pointer'
                        >
                            {loading ? <Spinner /> : "Send OTP"}
                        </button>
                    </form>
                )}


                {/*//! [6] OTP Entered Page (OTP Verification) */}
                {step === 2 && (
                    <form className='space-y-4' onSubmit={handleOtpSubmit(onOtpSubmit)}>
                        <p className={`text-center mb-4 
                            ${theme === 'dark' ? "text-gray-300" : "text-gray-700"}`}
                        >
                            Please enter the 6 digit OTP sent to your {" "}
                            <span className='text-gray-600 font-semibold'>{userPhoneData?.phoneNumber ? `${userPhoneData.phoneSuffix} ${userPhoneData.phoneNumber}` : "email"}</span>
                        </p>

                        {/*//^ Container for 6 OTP input boxes */}
                        <div className='flex justify-between'>
                            {otp.map((digit, index) => (
                                <input
                                    key={index}   //~ Unique key for React to track each input box in the array
                                    id={`otp-${index}`} //~ Unique id for each OTP input
                                    type='text'      //~ OTP is text so leading zeros are allowed
                                    maxLength={6}
                                    value={digit}   //~ Controlled input: value comes from OTP state array
                                    onChange={(e) => handleOtpChange(index, e.target.value)} //~ Update OTP state at this index
                                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                    className={`w-10 h-10 sm:w-12 sm:h-12 text-center border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 
                                     ${theme === 'dark'
                                            ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                                            : "bg-white border-gray-300 text-gray-800 placeholder:text-gray-400 text-base"}
                                     ${otpErrors.otp ? "border-red-500" : ""}`}
                                />
                            ))}
                        </div>

                        {/*//^ TIMER - WhatsApp Style (NEWLY ADDED BELOW OTP BOXES) */}
                        <div className="text-center">
                            <div className={`inline-block px-4 py-1 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}`}>
                                <div className={`text-lg font-bold ${timer <= 30 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                                    {formatTimer(timer)}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                    {timer > 0 ? 'OTP expires in' : 'OTP expired'}
                                </div>
                            </div>
                        </div>

                        {/*//^ Display OTP error if user entered wrong OTP */}
                        {otpErrors.otp && (
                            <p className='text-sm text-red-500'>
                                {otpErrors.otp.message}
                            </p>
                        )}

                        {/*//^ Submit button to verify OTP */}
                        <button type="submit"
                            className={`w-full text-white py-2 rounded-md transition font-semibold cursor-pointer
                                ${timer <= 0 || loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'}`}
                            disabled={timer <= 0 || loading}
                        >
                            {loading ? <Spinner /> : "Verify OTP"}
                        </button>

                        {/*//^ Resend OTP Button (only when timer is 0) - NEWLY ADDED */}
                        {timer <= 0 && (
                            <button
                                type="button"
                                onClick={handleResendOtp}
                                className="w-full mt-2 bg-red-500 hover:bg-red-600 text-white py-2 rounded-md transition flex items-center justify-center font-semibold"
                                disabled={loading}
                            >
                                <FaRedo className='mr-2' />
                                {loading ? <Spinner /> : "Resend OTP"}
                            </button>
                        )}

                        {/*//^ Button to go back to previous step (step-1) if user entered wrong number */}
                        <button
                            type="button"  //&  <-- Prevents from submitting the form
                            onClick={handleBack}
                            className={`w-full mt-2 rounded-md py-2 transition flex items-center justify-center cursor-pointer
                                ${theme === 'dark' ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        >
                            <FaArrowLeft className='mr-2' />
                            Wrong Number? Go Back
                        </button>
                    </form>
                )}


                {/*//!  [7] PROFILE SETUP  */}
                {step === 3 && (
                    <form className='space-y-4'
                        onSubmit={handleProfileSubmit(onProfileSubmit)}>
                        {/*//^ -------- PROFILE IMAGE + AVATARS -------- */}
                        <div className='flex flex-col items-center mb-4'>
                            <div className='relative w-24 h-24 mb-2'>
                                <img
                                    src={profilePicture || selectedAvatar} //& Show uploaded image OR selected avatar
                                    alt='profile'
                                    className='w-full h-full rounded-full object-cover'
                                />
                                <label
                                    htmlFor='profile-picture'
                                    className='absolute bottom-0 right-0 bg-green-500 text-white p-2 rounded-full cursor-pointer hover:bg-green-600 transition duration-300'
                                >
                                    <FaPlus className="w-4 h-4" />
                                </label>
                                <input
                                    type='file'       //~ File input for selecting images from device
                                    id='profile-picture'  //~ Unique ID so <label htmlFor="profile-picture"> can trigger it
                                    accept='images/*, .jpg,.jpeg,.png,.gif,.webp'   //~ Allows ONLY image files (jpg, png, jpeg, webp, etc.)
                                    onChange={handleFileChange}  //~ Runs when user selects a file
                                    className='hidden'  //~ Hide default browser file input UI
                                />
                            </div>
                            {/*//^ ------ Select Any AVATAR -------  */}
                            <p className={`text-[1.05rem] mb-4 ${theme === 'dark' ? "text-gray-300" : "text-gray-700"}`}>
                                Choose an Avatar
                            </p>
                            <div className='flex flex-wrap justify-center gap-2'>
                                {avatars.map((avatar, index) => (
                                    <img
                                        key={index}
                                        src={avatar}
                                        alt={`Avatar-${index + 1}`}
                                        className={`w-12 h-12 rounded-full cursor-pointer transition duration-300 ease-in-out transform hover:scale-110 
                                            ${selectedAvatar === avatar ? "ring-2 ring-green-500" : ""}`}
                                        onClick={() => setSelectedAvatar(avatar)}
                                    />
                                ))}
                            </div>
                        </div>
                        {/*//^  ------- USERNAME INPUT  */}
                        <div className='relative'>
                            <FaUser
                                className={` absolute left-3 top-1/2 transform -translate-y-1/2 
                                    ${theme === 'dark' ? "text-white" : "text-gray-400"}`}
                            />

                            <input
                                {...profileRegister("username")}
                                type='text'
                                placeholder='username'
                                className={`w-full pl-10 border py-2 pr-3 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-lg
                                    ${theme === 'dark'
                                        ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                                        : "bg-white border-gray-300 text-gray-700 placeholder:text-gray-500 text-[1rem]"}`}
                            />
                            {profileErrors.username && (
                                <p className='text-red-500 text-sm mt-1'>
                                    {profileErrors.username.message}
                                </p>
                            )}
                        </div>
                        {/*//^ -------- TERMS & CONDITIONS -------- */}
                        <div className='flex items-center space-x-2'>
                            <input
                                id="terms"
                                {...profileRegister('agreed')}
                                type='checkbox'
                                className={`rounded focus:ring-green-500 cursor-pointer
                                        ${theme === 'dark' ? "text-green-500 bg-gray-200" : "text-green-500"}`}
                            />
                            <label
                                htmlFor="terms"
                                className={`text-sm ${theme === 'dark' ? "text-gray-200" : "text-gray-700"}`}
                            >
                                I agree to the {" "}
                                <a href='#' className='text-red-500 hover:underline'>
                                    Terms & Conditions
                                </a>
                            </label>

                            {profileErrors.agreed && (
                                <p className='text-red-500 text-sm mt-1'>
                                    {profileErrors.agreed.message}
                                </p>
                            )}
                        </div>
                        {/*//^ -------- SUBMIT BUTTON -------- */}
                        <button
                            type="submit"
                            disabled={!watch("agreed") || loading}  //~ Disable button when:
                            //& 1) User has NOT checked "I agree to Terms & Conditions"
                            //& 2) OR an API request is currently in progress (loading = true)
                            className={`w-full bg-green-500 text-white font-bold px-4 py-2 rounded-md cursor-pointer 
                                    transform transition duration-300 ease-in-out hover:scale-105 flex items-center justify-center text-lg
                                    ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {loading ? <Spinner /> : "Create Profile"}
                        </button>
                    </form>
                )}
            </motion.div>
        </div>
    )
}

export default Login