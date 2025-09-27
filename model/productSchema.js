const mongoose = require('mongoose')
const {Schema} = mongoose

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description:{
        type: String,
        required:true
    },
    brand:{
        type: String,
        required: false
    },
    category:{
        type: Schema.Types.ObjectId,
        ref: "Category",
        required:true
    },
    regularPrice:{
        type:Number,
        required: true
    },
    salePrice:{
        type: Number,
        required: false
    },
    offer:{
        type:Number,
        default: 0
    },
    color:{
        type: String,
        required: true
    },
    productImage:{
        type: [String],
        required: true
    },
    isBlocked:{
        type: Boolean,
        default: false
    },
    status:{
        type:String,
        enum:["In Stock","Out of stock","Discountinued"]
    },
    sizeVariant:[
        {
            size: {
                type: String,
                enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'None']
            }, 
            quantity: {
                type: Number,
                required: true, 
                min: 0
            }
        }
       ],
    totalQuantity:{
        type: Number,
        min: 0
    }

},{timestamps:true})

const Product = mongoose.model("Product", productSchema)

module.exports = Product