const mongoose = require('mongoose')
const env = require('dotenv').config()

const connectDB = async ()=>{
   try{

        const connect = await mongoose.connect(process.env.MONGODB_URI)
        console.log(`mongoDB connected: ${connect.connection.host}`)

   }
   catch(error){
        console.log(error)
        process.next(1)
   }
}

module.exports = connectDB