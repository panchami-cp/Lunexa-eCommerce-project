const { Types } = require("mongoose")

const mongoose = require('mongoose')
const {Schema} = mongoose

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items:[{
        productId:{
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        size: {
            type: String,
            required: false
        },
        quantity:{
            type: Number,
            required: true,
            min: 1
        },
        price:{
            type: Number,
            required: true
        },
        totalPrice:{
            type: Number,
            required:true
        }, 
        regularPrice:{
            type: Number,
            required: true
        },
        totalRegularPrice:{
            type: Number,
            required: true
        }
    }],
    totalQuantity:{
        type: Number,
        default: 0,
        min: 0
    },
    totalCartPrice:{
        type: Number,
        required: false
    },
    totalMRP:{
        type: Number,
        required: false
    },
    totalDiscount:{
        type: Number,
        required: false
    }
})

const Cart = mongoose.model("Cart", cartSchema)
module.exports = Cart