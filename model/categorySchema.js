const { type } = require('express/lib/response')
const mongoose = require('mongoose')
const {Schema} = mongoose

const categorySchema = new Schema({
    categoryName:{
        type: String,
        require: true,
        unique: true
    },
    description:{
        type: String,
        required: true
    },
    isListed:{
        type: Boolean,
        default:true
    },
    categoryOffer:{
        type: Number,
        default:0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    offer:{
        type: Number,
        default: 0
    }
})

const Category = mongoose.model("Category", categorySchema)

module.exports = Category