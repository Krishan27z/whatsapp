//! This file handles all Cloudinary-related configuration & utilities for file uploads

import { v2 as cloudinary } from "cloudinary"
import multer from "multer"
import fs from "fs"
import dotenv from "dotenv"

dotenv.config()

//! STEP-1️⃣: Configure Cloudinary with credentials
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // Always use HTTPS
})

//! STEP-2️⃣: Function to upload a file to Cloudinary with PROPER FILE TYPE HANDLING
const uploadFileToCloudinary = async (file, options = {}) => {
    let filePath = file.path
    let originalMimeType = file.mimetype
    let originalFileName = file.originalname

    // HEIC/HEIF conversion
    // if (originalFileName.toLowerCase().endsWith('.heic') ||
    //     originalFileName.toLowerCase().endsWith('.heif') ||
    //     originalMimeType === 'image/heic' ||
    //     originalMimeType === 'image/heif') {
    //     try {
    //         const newFilePath = `${file.path}.jpg`
    //         await sharp(file.path).jpeg({ quality: 90 }).toFile(newFilePath)
    //         fs.unlinkSync(file.path)
    //         filePath = newFilePath
    //         originalMimeType = 'image/jpeg'
    //         originalFileName = originalFileName.replace(/\.(heic|heif)$/i, '.jpg')
    //     } catch (error) {
    //         throw new Error("Failed to convert HEIC image. Please convert to JPEG or PNG first.")
    //     }
    // }

    // Determine resource type
    let resource_type = 'auto'
    let folder = 'uploads'
    if (originalMimeType.startsWith('image/')) {
        resource_type = 'image'
        folder = options.forStatus ? 'status/images' : 'chat/images'
    } else if (originalMimeType.startsWith('video/')) {
        resource_type = 'video'
        folder = options.forStatus ? 'status/videos' : 'chat/videos'
    } else {
        resource_type = 'raw'
        folder = 'chat/documents'
    }

    // Base upload options
    const uploadOptions = {
        resource_type,
        folder,
        overwrite: false,
        timeout: 600000,
        ...(resource_type === 'video' && {
            chunk_size: 20000000,
            allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'],
            max_file_size: 500 * 1024 * 1024,
            use_filename: true,
            unique_filename: true,
            public_id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }),
        ...(resource_type === 'image' && {
            quality: 'auto:best',
            fetch_format: 'auto'
        })
    }

    // 🔥 STATUS VIDEO: TRY eager transformation, but NEVER fail if it doesn't work
    let useEager = false

    // 🔥 STATUS VIDEO: Try eager transformation (trim to 30s), fallback if fails
    if (options.forStatus && resource_type === 'video') {
        useEager = true
        uploadOptions.eager = [
            {
                duration: 30,
                start_offset: 0,
                crop: "limit",
                format: "mp4",
                video_codec: "h264",
                quality: "auto:good"
            }
        ]
        uploadOptions.eager_async = false
        uploadOptions.eager_notification_url = null
    }

    try {
        const result = await new Promise((resolve, reject) => {
            const uploadFn = cloudinary.uploader.upload
            uploadFn(filePath, uploadOptions, (error, res) => {
                // Always cleanup temp file
                try {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
                } catch (error) {
                    console.log(error.message)
                }
                if (error) reject(error)
                else resolve(res)
            })
        })

        // 🔥 Determine final URL and duration
        let finalUrl = result.secure_url
        let finalDuration = null

        if (options.forStatus && resource_type === 'video') {
            // Use eager URL if available
            if (result.eager && result.eager.length > 0) {
                finalUrl = result.eager[0].secure_url
            }
            // Duration = min(original, 30), fallback to 30
            finalDuration = result.duration ? Math.min(result.duration, 30) : 30
        }

        return {
            ...result,
            secure_url: finalUrl,
            duration: finalDuration,
            originalFileName,
            originalMimeType,
            fileSize: file.size
        }

    } catch (error) {
        console.error("❌ Cloudinary upload error:", {
            message: error.message,
            http_code: error.http_code,
            resource_type,
            forStatus: options.forStatus
        })

        // 🔥 FALLBACK: If status video eager transformation fails,
        // upload without eager and still return full URL + duration 30
        if (options.forStatus && resource_type === 'video') {
            // console.warn("⚠️ Eager transformation failed, falling back to full video. Frontend will limit to 30s.")
            delete uploadOptions.eager
            delete uploadOptions.eager_async
            delete uploadOptions.eager_notification_url

            try {
                const fallbackResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload(filePath, uploadOptions, (err, res) => {
                        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch (e) {}
                        if (err) reject(err)
                        else resolve(res)
                    })
                })

                // console.log("✅ Fallback upload successful (no trim)")
                return {
                    ...fallbackResult,
                    secure_url: fallbackResult.secure_url,
                    duration: 30, // Force 30s on frontend
                    originalFileName,
                    originalMimeType,
                    fileSize: file.size
                }
            } catch (fallbackError) {
                console.error("❌ Fallback upload also failed:", fallbackError)
                throw new Error("Video upload failed. Please try a different format (MP4 recommended).")
            }
        }

        // Cleanup if not already done
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch (e) {}
        throw new Error(`Upload failed: ${error.message || 'Unknown error'}`)
    }
}


//! STEP-2.(1️): 🔴 NEW FUNCTION - Upload video/audio specifically (for chatController.js)
const uploadVideoToCloudinary = async (file) => {
    // console.log("🎬 UPLOADING VIDEO (LARGE SUPPORT):", {
    //     name: file.originalname,
    //     size: (file.size / 1024 / 1024).toFixed(2) + " MB"
    // })

    try {
        // 🔴 USE upload_large FOR VIDEOS > 20MB, upload FOR SMALLER
        const fileSizeMB = file.size / (1024 * 1024)
        const useUploadLarge = fileSizeMB > 20

        // console.log(`📊 Video size: ${fileSizeMB.toFixed(2)}MB, using ${useUploadLarge ? 'upload_large' : 'upload'}`)

        let result

        if (useUploadLarge) {
            // For large videos (>20MB)
            result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_large(file.path, {
                    resource_type: 'video',
                    folder: 'chat/videos',
                    chunk_size: 20000000, // 20MB chunks
                    timeout: 900000, // 15 minutes timeout
                    allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'],
                    transformation: [
                        { quality: "auto:good" }
                    ],
                    overwrite: false,
                    // 🔴 ADD TAGS FOR TRACKING
                    tags: ['chat_video', 'large_file'],
                    // 🔴 CUSTOM CONTEXT
                    context: `caption=${encodeURIComponent(file.originalname)}`,
                    // 🔴 CUSTOM PUBLIC ID
                    public_id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                }, (error, uploadResult) => {
                    // Cleanup temp file
                    try {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path)
                        }
                    } catch (cleanupError) {
                        console.warn("⚠️ Temp file cleanup failed:", cleanupError.message)
                    }

                    if (error) {
                        // console.error("❌ UPLOAD_LARGE ERROR:", {
                        //     message: error.message,
                        //     http_code: error.http_code
                        // })
                        reject(error)
                    } else {
                        // console.log("✅ UPLOAD_LARGE SUCCESS")
                        resolve(uploadResult)
                    }
                })
            })
        } else {
            // For small videos (<20MB)
            result = await cloudinary.uploader.upload(file.path, {
                resource_type: 'video',
                folder: 'chat/videos',
                chunk_size: 6000000, // 6MB chunks
                timeout: 300000, // 5 minutes
                allowed_formats: ['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'],
                transformation: [
                    { quality: "auto:best" }
                ],
                overwrite: false
            })
        }

        // Cleanup temp file
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path)
        }

        return {
            ...result,
            originalFileName: file.originalname,
            originalMimeType: file.mimetype,
            fileSize: file.size
        }

    } catch (error) {
        console.error("❌ VIDEO UPLOAD ERROR:", {
            message: error.message,
            http_code: error.http_code,
            name: file.originalname,
            size: (file.size / 1024 / 1024).toFixed(2) + " MB"
        })

        // Cleanup temp file even on error
        if (fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path)
            } catch (e) {
                console.warn("⚠️ Temp file cleanup failed:", e.message)
            }
        }

        // 🔴 BETTER ERROR MESSAGES
        let errorMsg = `Video upload failed: ${error.message || 'Unknown error'}`

        if (error.http_code === 400) {
            errorMsg = "Invalid video format. Try converting to MP4 or MOV format."
        } else if (error.http_code === 413) {
            errorMsg = "Video too large. Maximum 500MB allowed."
        } else if (error.http_code === 504) {
            errorMsg = "Upload timeout. Try a smaller file or better internet connection."
        } else if (error.message && error.message.includes('format')) {
            errorMsg = "Unsupported video format. Please convert to MP4, MOV, or AVI format."
        }

        throw new Error(errorMsg)
    }
}


// ================= FILE TYPE VALIDATION =================
const allowedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/heic',
    'image/heif'
]

const allowedVideoTypes = [
    //~ Video types
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/avi',
    'video/x-msvideo',
    'video/3gpp',
    'video/mpeg',
    'video/x-m4v',
    'video/x-matroska',
    //~ Audio types
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'audio/x-ms-wma'
]

const allowedDocumentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]

//! STEP-3️⃣: Multer middleware
const multerMiddleware = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        console.log("🔍 FILE FILTER CHECK:", {
            name: file.originalname,
            type: file.mimetype,
            size: (file.size / 1024 / 1024).toFixed(2) + " MB"
        })

        // Check image
        if (file.mimetype.startsWith('image/')) {
            if (allowedImageTypes.includes(file.mimetype)) {
                return cb(null, true)
            }
            return cb(new Error('Unsupported image format. Use JPEG, PNG, GIF, etc.'), false)
        }

        // Check video/audio
        else if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
            // Check by MIME type
            if (allowedVideoTypes.includes(file.mimetype)) {
                return cb(null, true)
            }

            // Check by file extension (fallback)
            const lowerName = file.originalname.toLowerCase()
            if (lowerName.endsWith('.mp4') ||
                lowerName.endsWith('.mov') ||
                lowerName.endsWith('.avi') ||
                lowerName.endsWith('.mkv') ||
                lowerName.endsWith('.mp3') ||
                lowerName.endsWith('.wav') ||
                lowerName.endsWith('.m4a') ||
                lowerName.endsWith('.aac')) {
                return cb(null, true)
            }

            return cb(new Error(`Unsupported video/audio format: ${file.mimetype}. Use MP4, MOV, AVI, MP3, WAV, etc.`), false)
        }

        // Check documents
        else if (allowedDocumentTypes.includes(file.mimetype)) {
            return cb(null, true)
        }

        // Fallback: Check by extension for common types
        else {
            const lowerName = file.originalname.toLowerCase()
            if (lowerName.endsWith('.pdf') ||
                lowerName.endsWith('.doc') ||
                lowerName.endsWith('.docx') ||
                lowerName.endsWith('.txt') ||
                lowerName.endsWith('.xls') ||
                lowerName.endsWith('.xlsx') ||
                lowerName.endsWith('.ppt') ||
                lowerName.endsWith('.pptx')) {
                return cb(null, true)
            }

            return cb(new Error(`Unsupported file type: ${file.mimetype}`), false)
        }
    }
}).single('media')



//! STEP-4️⃣: Delete file from Cloudinary
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
     try {
        let result;
        
        if (resourceType === 'video' || resourceType === 'audio') {
            result = await cloudinary.uploader.destroy(publicId, {
                resource_type: 'video'
            });
        } else if (resourceType === 'document') {
            result = await cloudinary.uploader.destroy(publicId, {
                resource_type: 'raw'
            });
        } else {
            result = await cloudinary.uploader.destroy(publicId);
        }
        
        // console.log(`🗑️ Cloudinary delete result:`, result);
        return result;
    } catch (error) {
        console.error("❌ Cloudinary delete error:", error);
        throw error;
    }
}

//! STEP-5️⃣: Get Cloudinary public ID from URL
const getPublicIdFromUrl = (url) => {
    try {
        const matches = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.(jpg|jpeg|png|gif|webp|mp4|pdf|docx?|xlsx?|pptx?|txt)/i)

        if (matches && matches[1]) {
            const publicId = matches[1].replace(/\.[^/.]+$/, "")
            // console.log("🔗 Extracted Public ID:", publicId)
            return publicId
        }

        // console.log("⚠️ Could not extract Public ID")
        return null
    } catch (error) {
        // console.error("❌ Error extracting Public ID:", error)
        return null
    }
}

//& Export ALL utilities including the new video function
export {
    uploadFileToCloudinary,
    uploadVideoToCloudinary, // 🔴 NEW: Export video function
    multerMiddleware,
    deleteFromCloudinary,
    getPublicIdFromUrl,
    allowedImageTypes,
    allowedVideoTypes,
    allowedDocumentTypes
}
