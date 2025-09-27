const { type } = require('express/lib/response')
const mongoose = require('mongoose')
const {Schema} = mongoose

const walletSchema = new Schema({
    userId :{
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0
    },
    transactions:[
        {
            type: {
                type: String,
                required: true
            },
            amount:{
                type: Number,
                required:true
            },
            date:{
                type: Date,
                default: Date.now
            }
        }
    ]
})


const Wallet = mongoose.model('Wallet',walletSchema)
module.exports = Wallet