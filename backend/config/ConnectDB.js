import mongoose from "mongoose";

const ConnectDB = async() => {
    try {
        await mongoose.connect(process.env.MONGODB_URI) //* 'MONGODB_URI' comes from '.env' file
        console.log("MongoDB is connected")  //* Here MongoDB is connected to backend.
    } catch (err) {
        console.log(err)
    }
}
export default ConnectDB
