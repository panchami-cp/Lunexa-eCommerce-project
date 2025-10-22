const User = require('../../model/userSchema')
const Category = require('../../model/categorySchema')
const Product = require('../../model/productSchema')
const nodemailer = require('nodemailer')
const env = require('dotenv').config()
const bcrypt = require('bcrypt')
const { render } = require('ejs')
const Wishlist = require('../../model/wishlistSchema')
const Cart = require('../../model/cartSchema')
const Wallet = require('../../model/walletSchema')
const { redirect } = require('express/lib/response')


const  loadHomePage = async (req,res)=>{
    
   try {

        const userId = req.session.user 
        const categories = await Category.find({isListed: true})
        const wishlist = await Wishlist.findOne({userId: userId})
        const cart = await Cart.findOne({userId: userId})
        const totalCart = cart?cart.totalQuantity:0

        const categoryIds = categories.map((cat)=> cat._id)
        let productData = await Product.find({isBlocked: false, category:{$in: categoryIds}}).sort({updatedAt:-1}).populate('category')

        productData = productData.slice(0,3)

    for(let i=0; i<categories.length; i++){   

        let productsByCategory = await Product.find({isBlocked: false,
            category: categories[i]._id,
        }).sort({updatedAt:-1}).limit(4)

         categories[i] = {
            ...categories[i]._doc,
            productsByCategory 
        }

    }

    let wishlistIds = []
      if(wishlist){
        wishlistIds = wishlist.products.map(item=> item.productId.toString())
      }
        if(userId){
            return res.render('user/home',{
                totalCart,
                products: productData,
                categories: categories,
                wishlistIds
            })
        }else{
            return res.render('user/home',{products: productData,
                categories: categories,
                totalCart,
                wishlistIds
            })

        }
   } catch (error) {

    console.error('Error loding home page, '+error)
    
   }
    
}

const logout = async (req, res)=>{

    try {

        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error, ",err.message)
                return
            }
            return res.redirect('/')
        })
        
    } catch (error) {
        console.log("Logout error, ",error)
    }
}

const loadSignup = async (req,res)=>{
    try{

        let message = null

         if (req.session.messages && req.session.messages.length > 0) {
            message = req.session.messages[0];
            req.session.messages = []; 
        }

        return res.render('user/signup',{message})
    }
    catch(error){
        console.log("signup page not loading:" + error)
        
    }
}

function generateOtp(){

    return  Math.floor(100000 + Math.random() * 900000).toString()
    
    
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
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html:  `
            <p>Hello,</p>
            <p>Thanks for signing up. Your OTP is: <strong>${otp}</strong></p>
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


const signup = async (req,res)=>{

    try {

        const {fullname, email, password, referralCode} = req.body

        const userExist = await User.findOne({email})

        if(userExist){

            req.session.messages = ["User with this Email already exists"]
            console.log("User with this Email already exists")
            return res.redirect('/signup')
        }

        if(referralCode){

            const referrer = await User.findOne({referralCode: referralCode})

            if(!referrer){

                req.session.message = ["This referral code is invalid"]
                return res.redirect('/signup')

            }else{
                req.session.referralCode = referralCode
            }
        }

        const otp = generateOtp()
        
        const sendEmail = await sendVerificationEmail(email, otp)
        
        if(!sendEmail){

            return res.render('user/signup', { message: "Failed to send OTP. Please try again." });

        }

        req.session.userOtp = otp
        req.session.userData = {fullname, email, password}

        console.log("OTP send: " +otp)
        
        return res.render('user/verifyOtp')
        
    } catch (error) {

        console.error("signup error: "+ error)
        
    }
   

}

const loadVerifyOtp = async (req,res)=>{

        try {
            
            return res.render('user/verifyOtp')

        } catch (error) {
            console.error("OTP verification page not loading: "+error)
            res.status(500).send("Server Error")
        }
}

const securePassword = async (password)=>{
    try {

        const hashedPassword = await bcrypt.hash(password, 10)

        return hashedPassword
    } catch (error) {
        
    } 
}

const otpVerification = async (req,res)=>{
    try {

        const {otp} = req.body

        // console.log("otp: "+otp)
        // console.log("session.otp: "+req.session.userOtp)

        if(otp === req.session.userOtp){

            const user = req.session.userData
           
            const hashedPassword = await securePassword(user.password)
           
            const saveUserData = new User({
                fullname: user.fullname,
                email: user.email,
                password: hashedPassword,
                
            })

            await saveUserData.save()
            req.session.user = saveUserData._id

            const referralCode = req.session.referralCode
            
            const referrer = await User.findOne({referralCode: referralCode})

            if(referrer){
                let refWallet = await Wallet.findOne({userId: referrer._id})
                if(!refWallet){
                    refWallet = new Wallet({
                    userId: referrer._id,
                    balance: 0,
                    transactions: []
                })
                }

                const referrerReward = 100

                refWallet.balance += referrerReward
                refWallet.transactions.push({
                    type: "credit",
                    amount: referrerReward
                })

                await refWallet.save()

                const newUserWallet = new Wallet({
                    userId : saveUserData._id,
                    balance: 50,
                    transactions: [{
                        type: 'credit',
                        amount: 50
                    }]
                })

                await newUserWallet.save()

               return res.json({success: true, redirectUrl: '/'})
            }

             return res.status(200).json({success: true, redirectUrl:'/'})

        }else{
            
            res.status(400).json({success: false, message: "Invalid OTP, Please try again"})

        }

    } catch (error) {
        
        console.error("Error in verifying OTP: "+ error)
        res.status(500).json({success: false, message: "An error occured"})

    }
}

const resendOtp = async (req,res)=>{
    try {

        const {email} = req.session.userData
        if(!email){
            return res.status(400).json({success:false, message: "Email not found"})

        }

        const otp = generateOtp()
        req.session.userOtp = otp

        const sendEmail = await sendVerificationEmail(email, otp)

        if(sendEmail){
            console.log("Resend otp: "+ otp)
            res.status(200).json({success: true, message:"OTP Resend successfully"})

        }else{
            res.status(500).json({success:false, message:"Failed to resend OTP, Please try again"})

        }
        
    } catch (error) {
        console.error("error resending otp: "+error)
        res.status(500).json({success:false, message:"Internal server error. Please try again"})

    }
}

const loadLogin = async (req,res)=>{
    try {
        
        if(!req.session.user){
            return res.render('user/login', {message: null})
        }else{
            res.redirect('/')
        }
       

    } catch (error) {
        console.error("Error in load login page: "+ error)
    }
}

const login = async (req,res)=>{
    try {
        
        const {email, password} = req.body
        
        const findUser = await User.findOne({isAdmin:false,email: email})

        if(!findUser){

            return res.render('user/login',{message:"User not found"})

        }

        if(findUser.isBlocked){
            return res.render('user/login', {message:"User is blocked"})
        }

        if (findUser.googleId) {

            return res.render('user/login', { message: "Please login using Google." });
        }

        const matchPassword =  await bcrypt.compare(password, findUser.password)   
        
        if(!matchPassword){

            return res.render('user/login', {message:"Incorrect password"})

        }

        req.session.user = findUser._id
        
        res.redirect('/')

    } catch (error) {

        console.error("Error in login: ",error)
        res.render('user/login',{message: "Login failed. Please try again later"})

    }
}

const loadShopAll = async (req, res) => {
  try {
    const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest'
    const user = req.session.user
    const cart = await Cart.findOne({userId: user})
    const wishlist = await Wishlist.findOne({userId: user})

    const userData = await User.findOne({ _id: user })
    const totalCart = cart? cart.totalQuantity: 0
    const categories = await Category.find({isListed: true})
    const categoryIds = categories.map(cat => cat._id.toString())

    const search = req.query.search || ""
    const selectedCategory = req.query.category
    const page = parseInt(req.query.page) || 1
    const limit = 8
    const skip = (page - 1) * limit

    // Filtering
    const filter = {
      category: { $in: categoryIds },
      isBlocked: false
    };

    if (search.trim()) {
        filter.productName = { $regex: search, $options: "i" };
    }

    if (req.query.category) {
      filter.category = selectedCategory
    }

    // Price filtering
    const priceFilter = {};
    if (req.query.gte) priceFilter.$gte = parseInt(req.query.gte);
    if (req.query.lte) priceFilter.$lte = parseInt(req.query.lte);
    if (Object.keys(priceFilter).length) {
      filter.salePrice = priceFilter;
    }

    // Sorting
    const sortOption = {};
    if (req.query.sort === "low") {
      sortOption.salePrice = 1;
    } else if (req.query.sort === "high") {
      sortOption.salePrice = -1;
    } else if(req.query.sort === "aToz"){
        sortOption.productName = 1
    } else if(req.query.sort === "zToa"){
        sortOption.productName = -1
    }
    else {
      sortOption.createdAt = -1; // default sorting
    }

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const categoriesWithIds = categories.map(c => ({
      _id: c._id,
      categoryName: c.categoryName,
    }))
    let wishlistIds = []
    if(wishlist){
        wishlistIds = wishlist.products.map(item=> item.productId.toString())
    }
    const templateData = {
            user: userData,
            products,
            category: categoriesWithIds,
            totalProducts,
            totalPages,
            currentPage: page,
            search,
            totalCart,
            selectedCategory,
            wishlistIds
        }

        if(isAjax){
            return res.render('user/shopAll', templateData, (err, html)=>{
            if(err) return res.status(500).send('Error rendering users')
                res.send(html)
            })
        }

    res.render("user/shopAll", templateData)

  } catch (error) {
    console.error("Error in loading shop all page: ", error);
  }
}
module.exports = {
    loadHomePage,
    loadSignup,
    signup,
    loadVerifyOtp,
    otpVerification,
    resendOtp,
    loadLogin,
    login,
    loadShopAll,
    logout
}