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
    if(req.session.admin){
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
    }else{
        res.redirect('/admin/login')
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