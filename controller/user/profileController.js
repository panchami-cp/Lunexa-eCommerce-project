const User = require('../../model/userSchema')
const Address = require('../../model/addressSchema')
const Wallet = require('../../model/walletSchema')
const nodemailer = require('nodemailer')
const bcrypt = require('bcrypt')
const env = require('dotenv').config()
const session = require('express-session')
const STATUS = require('../../constants/statusCodes')

const loadEmailVerification = async (req, res)=>{

    try {

        res.render('user/verifyEmail')
        
    } catch (error) {

        console.error("Error in load forgot password page, "+error)
        
    }

}

function generateOtp(){

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    return otp
    
    
}

async function sendVerificationEmail(email, otp){
    try {

        const transporter = nodemailer.createTransport({
            service:'gmail',
            port: 587,
            secure:false,
            requireTLS: true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: `"LUNEXA - FASHION" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: "Verify your email",
            text: `Your OTP is ${otp}`,
            html:  `
            <p>Hello,</p>
            <p>Here is your One Time Password (OTP). Your OTP is: <strong>${otp}</strong></p>
            <p>This OTP is valid for 1 minutes.</p>
            <br>
            <p>— The LUNEXA Team</p>
          `
        })

        return info.accepted.length > 0
        
    } catch (error) {
        
        console.error("Error sending email:" + error)
        return false
    }
}

const emailVerification = async (req,res)=>{
    try {

        const {email} = req.body

        const findUser = await User.findOne({email: email})

        if(findUser){
            const otp = generateOtp()
            const sendMail = await sendVerificationEmail(email, otp)
            if(sendMail){
                req.session.otp = otp
                req.session.email = email
                res.render('user/verifyPassOtp')
                console.log("OTP Send: "+otp)

            }else{
                res.render('user/verifyEmail',{message:"Failed to send OTP, Please try again"})
            }
        }else{
            res.render('user/verifyEmail',{message:"User with this email does not exist"})
        }
        
    } catch (error) {
        console.error("Error in send otp, "+error)
    }
}

const verifyPassOtp = async (req,res)=>{
    try {

        const {otp} = req.body

        console.log("input otp: "+otp)

        if(otp === req.session.otp){
            res.json({success: true, redirectUrl:'/reset_password'})

        }else{
            res.json({success: false, message:"OTP not matching"})
        }
        
    } catch (error) {

        console.error("Error in verifying otp, "+error)
        return res.status(STATUS.SERVER_ERROR).json({ success: false, message: "Internal server error" });
        
    }
}

const resendPassOtp = async (req, res)=>{
    try {

        const otp = generateOtp()
        req.session.otp = otp

        const email = req.session.email
        const sendEmail = await sendVerificationEmail(email, otp)

        if(sendEmail){
            console.log("Resend otp: "+otp)
            return res.json({ success: true, message: "OTP sent successfully" });

        }else{
            return res.json({ success: false, message: "Failed to send OTP" });
        }
        
    } catch (error) {

        console.error("Error in resend otp, "+error)
        return res.status(STATUS.SERVER_ERROR).json({ success: false, message: "Internal server error" });
    }
}

const loadResetPassword = async (req,res)=>{
    try {

        res.render('user/resetPassword')
        
    } catch (error) {

        console.error("Error in load reset password, "+error)
        
    }
}

const securePassword = async (password)=>{
    try {

        const hashedPassword = await bcrypt.hash(password,10)
        return hashedPassword
        
    } catch (error) {
        
    }
}

const resetPassword = async (req, res)=>{

    try {

        const {password, confirmPasword} = req.body
        const email = req.session.email
        
        const hashedPassword = await securePassword(password)
        await User.updateOne(
            {email: email},
            {$set:{password: hashedPassword}}
        )

        res.redirect('/login')

        
    } catch (error) {
        console.error("Error in reset password, "+error)
    }
}

const userProfile = async (req, res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        const addressData = await Address.findOne( 
            {userId: userId, "address.isDefault": true },
            { "address.$": 1 })

        const defaultAddress = addressData?.address?.[0] || null;

        res.render('user/profile',{
            user: userData,
            address: defaultAddress
        })
        
    } catch (error) {

        console.error("error in load profile page, ",error)
        
    }

}

const loadAddress = async (req, res)=>{
    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        const userAddress = await Address.findOne({
            userId: userData._id
        })

        res.render('user/address', {
            user: userData,
            userAddress: userAddress
        })
        
    } catch (error) {
        console.error("error in loading address page: ",error)
    }
}

const loadAddAddress = async (req, res)=>{
    try {

        const redirectFrom = req.query.redirect

        req.session.redirectFrom = redirectFrom

        const userId = req.session.user

        const userData = await User.findById(userId)

        res.render('user/addAddress',{
            user: userData,
        })
        
    } catch (error) {

        console.error("Error in loading add address page: ",error)
        
    }
}

const addAddress = async(req, res)=>{
    try {

        const redirectTo = req.session.redirectFrom
        delete req.session.redirectFrom

        const userId = req.session.user
        const userData = await User.findOne({_id: userId})
        const {name,building, area, landmark, city,  state, pincode, phone, alternatePhone} = req.body

        const existingAddress = await Address.findOne({userId: userData._id})

        if(!existingAddress){
            
            const newAddress = new Address({
                userId: userData._id,
                address: [{ name,building, area, landmark, city,  state, pincode, phone, alternatePhone, isDefault: true}]
            })

            await newAddress.save()
        }else{
            existingAddress.address.push({name,building, area, landmark, city,  state, pincode, phone, alternatePhone})
            await existingAddress.save()
        }

        if(redirectTo === 'checkout'){
            res.redirect('/checkout')
        }else{
            res.redirect('/address')
        }

        
        
    } catch (error) {

        console.error("Error in adding address: ",error)
        
    }
}

const loadEditAddress = async (req,res)=>{
    try {

        const redirectFrom = req.query.redirect
        req.session.redirectFrom = redirectFrom

        const addressId = req.query.id
        const userId = req.session.user
        const userData = await User.findById(userId)
        const currentAddress = await Address.findOne({
            "address._id": addressId
        })

        if(!currentAddress){
            return res.redirect("/pageNotFound")
        }

        const addressData = currentAddress.address.find((item)=>{
            return item._id.toString() === addressId.toString()
        })

        if(!addressData){
            return res.redirect("/pageNotFound")
        }

        res.render('user/editAddress', {
            address: addressData, 
            user: userData
        })
        
    } catch (error) {

        console.error("Errorn in loading edit address: ", error)
        res.redirect('/pageNotFound')
        
    }
}


const editAddress = async (req, res)=>{
    try {

        const redirectTo = req.session.redirectFrom
        delete req.session.redirectFrom

        const data = req.body
        const addressId = req.query.id
        const userId = req.session.user

        const userData = await User.findById(userId)

        const findAddress = await Address.findOne({
            userId: userId
        })

        const currentAddress = findAddress.address.find(addr => addr._id.toString() === addressId.toString())

        const isDefault = currentAddress.isDefault

        if(!findAddress){
           return res.redirect('/pageNotFound')
        }

        await Address.updateOne(
            {"address._id": addressId},
            {
                $set: {
                    "address.$": {
                        _id: addressId,
                        name: data.name,
                        building: data.building,
                        area: data.area,
                        landmark: data.landmark,
                        city: data.city,
                        state: data.state,
                        pincode: data.pincode,
                        phone: data.phone,
                        alternatePhone: data.alternatePhone,
                        isDefault: isDefault
                    }
                }
            }
        )

        if(redirectTo === 'checkout'){
            res.redirect('/checkout')
        }else{
            
            res.redirect('/address')

        }

        
        
    } catch (error) {

        console.error("Error in editing address: ", error)
        res.redirect('/pageNotFound')
    }
}

const deleteAddress = async (req, res)=>{
    try {

        const addressId = req.query.id

        const findAddress = await Address.findOne({"address._id": addressId})

        if(!findAddress){

            return res.status(404).send("Address not found")

        }

        await Address.updateOne(
            {"address._id": addressId},
            {
                $pull: {
                    address: {
                        _id: addressId
                    }
                }
            }
        )

        res.redirect('/address')

        
    } catch (error) {

        console.error("Error in deleting address: ",error)
        res.redirect('/pageNotFound')
        
    }
}

const setDefaultAddress = async (req, res)=>{
    try {

        const userId = req.session.user
        const addressId = req.query.id

        await Address.updateOne(
            {userId: userId},
            {$set: { 'address.$[].isDefault': false }}
        )

        await Address.updateOne(
            {"address._id": addressId},
            {$set:{ 'address.$.isDefault': true }}
        )

        res.redirect('/address')
        
    } catch (error) {

        console.error("Error in set default address: ",error)
        
    }
}

const loadEditProfile = async (req, res)=>{
    try {

        const userId = req.session.user

        const userdata = await User.findById(userId)

        res.render('user/editProfile', {user: userdata})

        
    } catch (error) {

        console.error("Error in loading profile edit page: ", error)

        res.redirect('/pageNotFound')
    }
}

const editProfile = async (req,res)=>{
    try {

       const profileData = req.body

       const userId = req.session.user

       const findUser = await User.findById(userId)

         let updateFields = {
         fullname: profileData.name,
         gender: profileData.gender,
         phone: profileData.phone,
         alternatePhone: profileData.alternatePhone
       }

       if (req.file) {
         updateFields.profileImage = '/uploads/profile/' + req.file.filename;
       }

       await User.updateOne({_id: userId}, {$set:updateFields})

       res.redirect('/profile')

    } catch (error) {

        console.error("Error in edit address: ", error)

        res.redirect('/pageNotFound')
        
    }
}


const loadChangePassword = async (req,res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        if(!userId){

            res.redirect('/pageNotFound')

        }else{
            res.render('user/changePassword',{user: userData})
        }
        
    } catch (error) {

        console.log("Error in loding change password page :", error)

        res.redirect('/pageNotFound')
        
    }
}

const changePassword = async(req, res)=>{

    try {

        const password = req.body.password

        const newPassword = req.body.newPassword

        const userId = req.session.user

        const findUser = await User.findById(userId)

        const matchPassword = await bcrypt.compare(password, findUser.password)

        if(!matchPassword){

            return res.render('user/changePassword', {message:"Current password is incorrect", user: findUser})

        }else{

            const hashedNewPassword = await securePassword(newPassword)

            await User.updateOne({_id: userId},{$set:{password: hashedNewPassword}})

            res.render('user/changePassword', {message: "Password changed successfully", user: findUser})            

        }

        
    } catch (error) {

        console.error("Error in changing password: ", error)

        res.redirect('/pageNotFound')
        
    }
}

const loadOtpVerification = async(req,res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        if(!userData){

            res.redirect('/pageNotFound')

        }else{

            const currentEmail = userData.email

            const otp = generateOtp()

            const sendMail = await sendVerificationEmail(currentEmail, otp)

            if(sendMail){

                req.session.otp = otp

                req.session.email = currentEmail

                res.render('user/verifyEmailOtp')

                console.log("OTP Send: "+otp)

            }else{

                res.render('user/verifyEmailOtp',{message:"Failed to send OTP, Please try again"})
            }

        }

        
    } catch (error) {

        console.error("Error in loading OTP verification page to change email: ",error)

        res.redirect('/pageNotFound')
        
    }
}

const changeEmailOtp = async (req,res)=>{

    try {

        const userId = req.session.user

        const user = await User.findById(userId)

        if(!user){
            return res.redirect('/pageNotFound')
        }

        const inputOtp = req.body.otp

        const newEmail = req.session.email

        if(inputOtp === req.session.otp){

            await User.updateOne({_id: userId},{$set:{email:newEmail}})

            res.json({success: true, redirectUrl:'/profile'})

        }else{
            res.json({success: false, message:"OTP not matching"})
        }

    } catch (error) {
        
        console.error("Error in verifying otp to change email: ",error)

        res.redirect('/pageNotFound')
    }
}

const loadNewEmail = async (req, res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        res.render('user/newEmail',{ user:userData, message: null})
        
    } catch (error) {

        console.error("Error in loading new email page: ", error)

        res.redirect('/pageNotFound')
        
    }
}

const newEmail = async(req,res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        const newEmail = req.body.email

        const existingEmail = await User.findOne({email: newEmail})

        if(existingEmail){

           return res.render('user/newEmail', {message: "This email already exists", user:userData})

        }

        const otp = generateOtp()

        const sendMail = await sendVerificationEmail(newEmail, otp)

        if(sendMail){

            req.session.otp = otp

            req.session.email = newEmail

            res.render('user/verifyEmailOtp')

            console.log("OTP Send: "+otp)

        }else{

            res.render('user/newEmail',{message:"Failed to send OTP, Please try again"})
        }
    
    } catch (error) {

        console.error("Errorn in update  new email: ", error)

        res.redirect('/pageNotFound')
        
    }
}

const wallet = async(req, res)=>{
    try {
        const page = parseInt(req.query.page) || 1
       
        const limit = 5
        const skip = (page - 1) * limit
        const userId = req.session.user

        const user = await User.findById(userId)

        if(!user){
            return res.redirect('/userNotFound')
        }

        let wallet = await Wallet.findOne({userId: userId})
        let transactions = wallet.transactions

        console.log(transactions)

        if(!wallet){
            wallet = {
                balance : 0,
                transactions: []
            }
        }
        let totalPages = Math.ceil(transactions.length/limit)
        res.render('user/wallet',{
            wallet ,
            transactions,
            currentPage: page,
            totalPages
        })
        
    } catch (error) {
        console.error("Error in loading wallet: ", error)
    }
}


module.exports = {

    loadEmailVerification,
    emailVerification,
    verifyPassOtp,
    resendPassOtp,
    resetPassword,
    loadResetPassword,
    userProfile,
    loadAddress,
    loadAddAddress,
    addAddress,
    loadEditAddress,
    editAddress,
    deleteAddress,
    setDefaultAddress,
    loadEditProfile,
    editProfile,
    loadChangePassword, 
    changePassword,
    loadOtpVerification,
    changeEmailOtp,
    loadNewEmail, 
    newEmail,
    wallet
}