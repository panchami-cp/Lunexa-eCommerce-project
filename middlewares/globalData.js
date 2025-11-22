const User = require('../model/userSchema')
const Cart = require('../model/cartSchema')

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

const setUser = (req, res, next)=>{
   res.locals.user = req.user || null
  next()
}

module.exports = {
    setUserName,
    cart,
    setUser
}