const { type } = require('express/lib/response')
const mongoose = require('mongoose')
const {Schema} = mongoose
const {v4:uuidv4, stringify} = require('uuid')

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: ()=>uuidv4(),
        unique: true
    },
    userId:{
        type: Schema.Types.ObjectId,
        ref: 'User',
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
        },
         orderStatus:{
            type:String,
            required: true,
            enum:['Placed','Cancelled','Shipped','Out for delivery', 'Delivered', 'Returned'],
            default: 'Placed'
        },
         returnRequest: {
            status: {
                type: String,
                enum: ['Pending', 'Approved', 'Rejected', 'Refunded'],
                default: null
            },
            reason: {
                type: String,
                
            },
            requestedAt: {
                type: Date,
                default: Date.now
            }
        },
        deliveryDate: {
            type: Date,
        }

        }],

        totalMRP:{
            type: Number,
            required: true
        },
        totalDiscount:{
            type: Number,
            default: 0
        },
        finalAmount:{
            type: Number,
            required: true
        },
        couponDiscount:{
            type: Number,
            default: 0
        },
        paymentMethod:{
            type: String,
            enum:['cashOnDelivery', 'razorpay', 'wallet'],
            required: true
        },
        paymentStatus: {
            type: String,
            enum: ['Pending', 'Success', 'Failed'],
            default: 'Success'
        },
        address:{
           name:{
            type: String,
            required: true
           },
           building:{
            type: String,
            required: true
           },
           area:{
            type: String,
            required: true
           },
           landmark:{
            type: String,
            required: true
           },
           city:{
            type: String,
            required: true
           },
           state:{
            type: String,
            required: true
           },
           pincode:{
            type: Number,
            required: true
           },
           phone:{
            type: String,
            required: true
           },
           alternatePhone:{
            type: String,
            required: false
           }
        },
        razorpayOrderId: {
            type: String,
        },
        razorpayPaymentId:{
            type: String
        },
        invoiceDate:{
            type: Date
        },
       
        createdOn:{
            type: Date,
            default: Date.now,
            required: true
        },
        coupon: {
            type: Schema.Types.ObjectId,
            ref: "Coupon",
            default: null
        },
        cancelled:{
            type: Boolean,
            default: false
        }
},{ timestamps: true })

const Order = mongoose.model('Order',orderSchema)
module.exports = Order