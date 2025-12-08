const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../model/userSchema')
const env = require('dotenv').config()


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},

async (accessToken, refreshToken,profile,done)=>{

     try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
            return done(null, false, { message: "Email not provided by Google" });
        }

        let user = await User.findOne({ email });

        if (user) {
            if (user.googleId) {
                return done(null, user);
            } else {
                
                return done(null, false, { message: "User with this email already exists. Please use password login." });
            }
        } else {
            
            const newUser = new User({
                fullname: profile.displayName,
                email,
                googleId: profile.id,
            });

            await newUser.save();
            return done(null, newUser);
        }
    } catch (error) {
        return done(error, null)
    }
}
))

passport.serializeUser((user, done)=>{

    done(null,user.id)

})

passport.deserializeUser((id, done)=>{
    User.findById(id)
    .then(user=>{
        done(null,user)

    })
    .catch(err=>{
        done(err,null)
    })
})

module.exports = passport

