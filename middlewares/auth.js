const User = require('../model/userSchema')
const Cart = require('../model/cartSchema')

const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next()
            }else{
                res.redirect('/login')
            }
        })
        .catch(error=>{
            console.log("Error in user auth middleware "+error)
            res.status(500).send("Internal server error")

        })
    }else{
        res.redirect('/login')
    }
}

const adminAuth = (req,res,next)=>{
    User.findOne({isAdmin:true})
    .then(data=>{
        if(data){
            next()
        }else{
            res.redirect('/admin/login')
        }
    })
    .catch(error=>{
        console.log("Error in adminAuth middleware "+error)
        res.status(500).send("Internal server error")
    })
}

const setUserName = async (req, res, next) => {
  try {
    if (req.session && req.session.user) {

      const user = await User.findById(req.session.user).select('fullname')

      if (user) {
        res.locals.user = user 
      } else {
        res.locals.user = null
      }
    } else {
      res.locals.user = null
    }
    next()
  } catch (err) {
    console.error("Error in setUserName middleware:", err)
    res.locals.user = null
    next()
  }
}

const checkBlocked = async (req, res, next) => {
    if (req.session.user) {
        const user = await User.findById(req.session.user)

        if (user && user.isBlocked) {

            req.session.destroy(err => {
                if (err) {
                    console.error("Error destroying session:", err);
                }
                return res.render('user/login', { message: "Your account has been blocked." });
            });
            return;
        }
    }
    next();
}

const cart = async (req, res, next)=>{

    try {

        const userId = req.session.user

    if(!userId){
        res.locals.cart = null
        return next()
    }

    const cartData = await Cart.findOne({userId: userId})

    if(cartData){

        res.locals.cart = cartData.totalQuantity

    }else{

        res.locals.cart = null
    }

    next()
        
    } catch (error) {

        next(error)
        
    }
    
    

}






module.exports = {
    userAuth,
    adminAuth,
    setUserName,
    checkBlocked,
    cart
}