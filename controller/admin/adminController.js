const User = require('../../model/userSchema')
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const { render } = require('ejs')


const loadLogin = (req,res)=>{

    if(req.session.admin){
        return res.redirect('/admin')
    }

    res.render('admin/login',{message:null})

}

const login = async (req,res)=>{
    try {
        
        const {email, password} = req.body
        
        const admin = await User.findOne({email, isAdmin:true})

        if(admin){
            
            const matchPassword = await bcrypt.compare(password,admin.password)

            if(matchPassword){

                req.session.admin = true
                return res.redirect('/admin')

            }else{

                return res.render('admin/login',{message:"Incorrect password"})

            }
        }else{

            return res.render('admin/login',{message:"Admin not found"})

        }

    } catch (error) {
        console.error("login error: "+error)
    }
}

const logout = async (req, res)=>{

    try {

        req.session.destroy((err)=>{
            if(err){
                console.log("Session destruction error, ",err.message)
                return
            }
            return res.redirect('/admin/login')
        })
        
    } catch (error) {
        console.log("Logout error, ",error)
    }

}

const loadDashboard = async (req,res)=>{
    try {
        if(req.session.admin){
            res.render('admin/dashboard')
        }
    } catch (error) {
        console.log("Error loading dashboard: "+error)
    }
}


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    logout
}



