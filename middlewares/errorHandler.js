const errorPage = (req, res)=>{
    res.redirect('/pageNotFound')
}

module.exports = {
    errorPage
}