const env = require('dotenv').config()

const errorPage = (req, res)=>{
    res.redirect('/pageNotFound')
}

const errorHandler = (err, req, res, next)=>{
    console.error("Error:", err);

    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode);

    res.json({
        success: false,
        message: err.message || "Internal Server Error",
        stack: process.env.NODE_ENV === "production" ? null : err.stack
    });
}

module.exports = {
    errorPage,
    errorHandler
}