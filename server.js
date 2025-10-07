const express = require('express')
const app = express()
const userRoutes = require('./routes/userRoutes')
const connectDB = require('./config/connectDB')
const path = require('path')
const env = require('dotenv').config()
const session = require('express-session')
const passport = require('./config/passport')
const flash = require('connect-flash')
const adminRoutes = require('./routes/adminRoutes')
const {setUserName, userAuth, adminAuth, checkBlocked, cart} = require('./middlewares/auth')



app.use(express.json())
app.use(express.urlencoded({extended:true})) 

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72*60*60*1000
    }
}))

app.use(flash())

app.use((req, res, next) => {
  res.locals.error = req.flash('error')
  res.locals.success = req.flash('success')
  next()
})


app.use(passport.initialize())
app.use(passport.session())

app.use((req, res, next) => {
  res.locals.user = req.user || null
  next()
})





app.use((req, res, next)=>{
    res.set('cache-control', 'no-store')
    next()
})


app.use(setUserName)
app.use(cart)
app.use(checkBlocked)

//route
app.use('/',userRoutes)
app.use('/admin',adminRoutes)


//connect mongodb
connectDB()


//set view engine
app.set("view engine","ejs")
app.set("views",path.join(__dirname,"views"))


//set public assets
app.use(express.static('public'))


//port
app.listen(process.env.PORT,()=>{
    console.log("server started at port 4002")
})