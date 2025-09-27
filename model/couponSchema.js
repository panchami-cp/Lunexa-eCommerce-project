const { type } = require('express/lib/response')
const mongoose = require('mongoose')

const {Schema} = mongoose

const couponSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true,
        unique: true
    },
     startDate:{
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    offerType:{
        type: String,
        required: true,
        enum:["percentage", "flat"]
    },
    offerPercentage:{
        type: Number
    },
    flatOffer:{
        type: Number
    },
    minimumPrice: {
        type: Number,
        required: true
    },
    isListed: {
        type: Boolean,
        default: true
    },
    userId: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
     createdOn: {
        type: Date,
        default: Date.now,
        required: true
    }

})

const Coupon = mongoose.model("Coupon", couponSchema)

module.exports = Coupon