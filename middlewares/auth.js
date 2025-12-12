const User = require('../model/userSchema')
const Cart = require('../model/cartSchema')

const userAuth = (req,res,next)=>{
    if(req.session.user){
        User.findById(req.session.user)
        .then(data=>{
            if(data && !data.isBlocked){
                next()
            }else{
                return handleAuthFailure(req, res)
            }
        })
        .catch(error=>{
            console.log("Error in user auth middleware "+error)
            res.status(500).send("Internal server error")
        })
    }else{
        return handleAuthFailure(req, res)
    }
}
//helper
function handleAuthFailure(req, res) {
    const isJsonRequest =
    req.xhr ||
    req.headers.accept?.includes("application/json") ||
    req.headers["content-type"]?.includes("application/json")

  if (isJsonRequest) {
    return res.json({
      success: false,
      loginRequired: true,
      message: "Please log in or sign up to continue",
      redirectUrl: '/login'
    });
  }
  return res.redirect('/login');
}

const adminAuth = async(req,res,next)=>{
   
     try {

        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const admin = await User.findOne({
            _id: req.session.admin._id,
            isAdmin: true
        });

        if (!admin) {
            return res.redirect('/admin/login');
        }

        next();

    } catch (error) {
        console.log("Error in adminAuth middleware:", error);
        return res.status(500).send("Internal server error");
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

module.exports = {
    userAuth,
    adminAuth,
    checkBlocked
}