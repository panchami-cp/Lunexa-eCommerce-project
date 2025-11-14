const express = require('express')
const router = express.Router()
const usercontroller = require('../controller/user/userController')
const passport = require('passport')
const profileController = require('../controller/user/profileController')
const productController = require('../controller/user/productController')
const orderController = require('../controller/user/orderController')
const {userAuth, adminAuth} = require('../middlewares/auth')
const uploadProfile = require('../middlewares/profileUploads')
const { rotate } = require('pdfkit')

//User controller
router.get('/',usercontroller.loadHomePage)
router.get('/signup',usercontroller.loadSignup)
router.post('/signup', usercontroller.signup)
router.get('/verify_otp', usercontroller.loadVerifyOtp)
router.post('/verify_otp',usercontroller.otpVerification)
router.post('/resend_otp', usercontroller.resendOtp)
router.get('/login',usercontroller.loadLogin)
router.post('/login',usercontroller.login)
router.get('/logout', userAuth,usercontroller.logout)
router.get('/shop_all', usercontroller.loadShopAll)
//User controller//google auth
router.get('/auth/google',passport.authenticate('google',{scope:['profile', 'email'] })) 
router.get('/auth/google/callback', 
    passport.authenticate('google',{failureRedirect:'/signup', failureMessage: true }),
    (req,res)=>{
        req.session.user = req.user._id
        res.redirect('/')
    })

//Profile controller
router.get('/verify_email', profileController.loadEmailVerification)
router.post('/verify_email', profileController.emailVerification)
router.post('/verify_passotp', profileController.verifyPassOtp)
router.post('/resend_passotp', profileController.resendPassOtp)
router.get('/reset_password',profileController.loadResetPassword)
router.post('/reset_password',profileController.resetPassword)
router.get('/profile', userAuth, profileController.userProfile)
router.get('/edit_profile', userAuth, profileController.loadEditProfile)
router.post('/edit_profile', userAuth,uploadProfile.single('profileImage'), profileController.editProfile)
router.get('/change_password', userAuth, profileController.loadChangePassword)
router.post('/change_password', userAuth, profileController.changePassword)
router.get('/change_email', userAuth, profileController.loadNewEmail)
router.post('/change_email', userAuth, profileController.newEmail) 
router.post('/change_email/resend_otp',userAuth, profileController.resendPassOtp)
router.post('/new_email_otp', userAuth, profileController.changeEmailOtp)
router.get('/wallet', userAuth, profileController.wallet)


//address controller
router.get('/address', userAuth, profileController.loadAddress)
router.get('/add_address', userAuth, profileController.loadAddAddress)
router.post('/add_address', userAuth, profileController.addAddress)
router.get('/edit_address', userAuth, profileController.loadEditAddress)
router.post('/edit_address', userAuth, profileController.editAddress)
router.get('/delete_address', userAuth, profileController.deleteAddress)
router.get('/set_default', userAuth, profileController.setDefaultAddress)

//product controller
router.get('/product_details',productController.productDetails)
router.get('/addtoWishlist',userAuth,productController.addToWishlist)
router.get('/wishlist',userAuth, productController.loadWishlist)
router.post('/addToCart', userAuth, productController.addToCart)
router.get('/cart', userAuth, productController.loadcart)
router.get('/remove_product', userAuth, productController.removeProduct)
router.post('/cart/update_quantity',userAuth, productController.updateQuantity)
router.get('/removeFromWishlist', userAuth, productController.removeFromWishlist)
router.get('/product-sizes',userAuth, productController.loadSizes)

//order controller
router.get('/checkout', userAuth, orderController.loadCheckout)
router.post('/place_order', userAuth, orderController.placeOrder)
router.get('/order_success',userAuth, orderController.orderSuccess)
router.get('/orders', userAuth, orderController.viewOrder)
router.get('/order_details', userAuth, orderController.orderDetails)
router.get('/cancel_order', userAuth, orderController.loadCancelOrder)
router.post('/cancel_order', userAuth, orderController.cancelOrder)
router.get('/return_order', userAuth, orderController.returnOrderPage)
router.post('/return_order', userAuth, orderController.returnOrder)
router.get('/download_invoice', userAuth, orderController.downloadInvoice)
router.post('/apply_coupon', userAuth, orderController.applyCoupon)
router.post('/remove_coupon', userAuth, orderController.removeCoupon)
router.post('/verify_payment', userAuth, orderController.verifyPayment)
router.post('/payment_failure', userAuth, orderController.paymentFail)
router.get('/order_failure', userAuth, orderController.orderFailurePage)
router.post('/cancel_all', userAuth, orderController.cancelAllOrder)
router.post('/return_all', userAuth, orderController.returnAllOrder)
router.post('/retry_payment', userAuth, orderController.retryPayment)

//page not found
router.get('/pageNotFound', (req, res)=>{
    try {
        res.render('user/pageNotfound')
    } catch (error) {
        console.error(error)
    }
})

//user not found
router.get('/userNotFound', (req, res)=>{
    try {
        res.render('user/userNotFound')
    } catch (error) {
        console.error(error)
    }
})


module.exports = router