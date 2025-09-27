const { type } = require('express/lib/response')
const mongoose = require('mongoose')
const {Schema} = mongoose

const userSchema = new Schema({

        fullname:{
            type:String,
            required:true
        },
        profileImage:{
            type: String,
            required: false
        },
        gender:{
            type: String,
            required: false
        },
        email:{
            type:String,
            required:true,
            unique: true
        },
        referralCode:{
            type: String,
            unique: true
        },
         phone:{
             type:String,
            required: false,
            unique: false,
            sparse: true,
            default: null
        },
         alternatePhone: {
            type: String,
            required: false
        },
        googleId: {
            type: String,
            sparse:true,
            unique: true
        },
        password:{
            type:String,
            required:false
        },
        isBlocked: {
            type: Boolean,
            default: false
        },
        isAdmin:{
            type: Boolean,
            default: false
        },
        cart: [{
            type: Schema.Types.ObjectId,
            ref: "Cart"
        }],
        wishlist: [{ 
            type: Schema.Types.ObjectId,
            ref: "Wishlist"
        }],
        orderHistory: [{ 
            type: Schema.Types.ObjectId,
            ref: "Order"
        }],
        createdOn: {
            type: Date,
            default: Date.now
        },
        referalCode:{
            type: String
        },
        redeemed:{
            type: Boolean
        },
        redeemedUsers:[{
            type:Schema.Types.Boolean,
            ref: "User"
        }],
        searchHistory:[{
            category:{
                type: Schema.Types.ObjectId,
                ref:"Category"
            },
            brand:{
                type:String
            },
            searchOn:{
                type: Date,
                default:Date.now
            }
        }],
        usedCoupon: [{
           couponId: {
            type: Schema.Types.ObjectId,
            default: null
           }
        }]

})

function generateReferralCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

userSchema.pre('save', async function (next) {
    if (!this.referralCode) {
        let code;
        let exists = true;

        while (exists) {
            code = generateReferralCode(8);
            exists = await mongoose.models.User.exists({ referralCode: code });
        }

        this.referralCode = code;
        console.log('referral Code: ',code)
    }
    next();
});


const User = mongoose.model("User",userSchema)

module.exports = User