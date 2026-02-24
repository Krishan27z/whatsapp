import express from 'express'
import authMiddleware from '../middlewares/authMiddleware.js'
import { multerMiddleware } from '../config/cloudinaryConfig.js'
import { 
    createStatus, 
    getStatus, 
    viewStatus, 
    deleteStatus,
    reactToStatus,       // 🔥 NEW: reaction add/update
    removeReaction       // 🔥 NEW: reaction remove
} from '../controllers/statusController.js'

const router = express.Router()  //* Creating a new Express router instance

//^ 1️⃣. CREATE A NEW STATUS
router.post('/', authMiddleware, multerMiddleware, createStatus) //~ Middlewares (executed in order):
                                                            //~   1. authMiddleware → checks if user is logged in (JWT verification)
                                                            //~   2. multerMiddleware → processes file/image uploads (e.g., photo/video status)
                                                            //~   3. createStatus → actual controller function that saves the status in DB

//^ 2️⃣. GET ALL STATUSES OF THE LOGGED-IN USER
router.get('/', authMiddleware, getStatus)  //~ 'getStatus' controller queries the DB and returns all relevant status updates

//^ 3️⃣. MARK A STATUS AS VIEWED
router.put('/:statusId/view', authMiddleware, viewStatus) //~ ':statusId' is a route parameter (the unique ID of that specific status)
                                                        //~ 'authMiddleware' protects it, and 'viewStatus' updates the DB to mark it as seen by user

//^ 4️⃣. DELETE A SPECIFIC STATUS
router.delete('/:statusId', authMiddleware, deleteStatus) //~ ':statusId' is a route parameter (the unique ID of that specific status)
                                                        //~ 'deleteStatus' removes the record (and media if needed) from the database

// 🔥 ======================== 🆕 REACTION ROUTES ========================
//^ 5️⃣. ADD / UPDATE REACTION ON A STATUS (like, love, wow, sad)
router.post('/:statusId/reaction', authMiddleware, reactToStatus) //~ ':statusId' → status ID
                                                                 //~ Body: { "type": "love" }

//^ 6️⃣. REMOVE REACTION FROM A STATUS
router.delete('/:statusId/reaction', authMiddleware, removeReaction) //~ ':statusId' → status ID
                                                                    //~ No body required

export default router  //* Exporting the router so it can be used in 'index.js' file