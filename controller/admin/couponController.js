const { redirect } = require('express/lib/response')
const Coupon = require('../../model/couponSchema')

const loadCoupon = async (req, res)=>{
    try {

        const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest'

        let search = req.query.search || ""
        
        let page = parseInt(req.query.page) || 1
        
        const limit = 5
        let skip = (page - 1)*limit

        const coupons = await Coupon.find({name:{$regex:".*"+search+".*", $options:"i"}})
        .sort({createdOn:-1})
        .skip(skip)
        .limit(limit)

        const totalCoupons = await Coupon.countDocuments()
        const totalPages = Math.ceil(totalCoupons/limit)

         const templateData = {
            coupons,
            totalPages: totalPages,
            currentPage: page,
            totalCoupons,
            search
        }

         if(isAjax){
            return res.render('admin/coupon', templateData, (err, html)=>{
            if(err) return res.status(500).send('Error rendering users')
                res.send(html)
            })
        }

        res.render('admin/coupon', templateData)
        
    } catch (error) {
        console.error("Error in loading coupon page: ", error)
        res.redirect('/pageNotFound')
    }

}

const addCoupon = async (req, res)=>{
    try {

        const {couponName, couponCode, startDate, endDate, offerType, offerPercentage, flatOffer, minPrice} = req.body

        if(!couponName){
            return res.status(400).json({success: false, message: "Enter a coupon name" })
        }

        const existingCoupon = await Coupon.findOne({name: { $regex: `^${couponName.trim()}$`, $options: "i" } })
    
        if (existingCoupon) {
            return res.status(400).json({success: false, message: "Coupon with this name already exists." });
        }

        const codeRegex = /^[A-Za-z0-9_-]{3,20}$/

        if(!codeRegex.test(couponCode)){
            return res.status(400).json({success: false, message: "Coupon code must be 3-20 characters and can only contain letters, numbers, underscores, and hyphens." })
        }

        const existingCouponCode = await Coupon.findOne({code: { $regex: `^${couponCode.trim()}$`, $options: "i" } })

        if (existingCouponCode) {
            return res.status(400).json({success: false, message: "This coupon code has already taken" })
        }

        const today = new Date().setHours(0,0,0,0)

        if (new Date(startDate) < today) {
            return res.status(400).json({success: false, message: "The date cannot be the day before today" })
        }

        if (new Date(startDate) >= new Date(endDate)) {
            return res.status(400).json({success: false, message: "End date must be after start date." })
        }

        if (offerType === "percentage") {

            if (offerPercentage <= 0 || offerPercentage > 90) {
                return res.status(400).json({success: false, message: "Percentage should be between 1% and 90%." })
            }
        }

        if (offerType === "flat") {
            if (flatOffer <= 0) {
                return res.status(400).json({success: false, message: "Flat discount must be greater than 0." });
            }
            if (flatOffer > 1000) {
                return res.status(400).json({success: false, message: "The maximum flat price is 1000" });
            }

        }

        if(minPrice < 500){
            return res.status(400).json({success: false, message: "Minimum purchase price must be at least 500." })
        }

        if(offerType === "flat" && Number(minPrice) <= Number(flatOffer)){
            console.log('minimum price: ',minPrice)
            console.log('offer price: ',flatOffer)
            return res.status(400).json({success: false, message: "Minimum price must be greater than flat offer price." })
        }
        
        const flatOfferCutOff = (minPrice * 50)/100

        if(offerType === 'flat' && Number(flatOffer) > flatOfferCutOff){
            return res.status(400).json({success: false, message: "Flat offer price should not exceed 50% of minimum purchase price" })
        }

    const couponData = {
        name: couponName,
        code: couponCode,
        startDate,
        endDate,
        offerType,
        minimumPrice: minPrice
    }

    if(offerType === 'percentage'){
        couponData.offerPercentage = offerPercentage
    }else if(offerType === 'flat'){
        couponData.flatOffer = flatOffer
    }

    const newCoupon = new Coupon(couponData)
    await newCoupon.save()

    res.status(200).json({success: true, message: "Coupon created successfully."});
        
    } catch (error) {
        console.error("Error in creating new coupon: ",error)
        res.status(500).json({success: false, redirectUrl: "/pageNotFound"})
    }
}

const deleteCoupon = async (req, res)=>{
    try {

        const couponId = req.query.id

        const coupon = await Coupon.findById(couponId)

        if(!coupon){
            return res.redirect('/pageNotFound')
        }

        await Coupon.findByIdAndDelete(couponId)
        
        res.redirect('/admin/coupon')

    } catch (error) {

        console.error("Error in delete coupon: ", error)
        res.redirect('/pageNotFound')
        
    }
}

module.exports = {
    loadCoupon,
    addCoupon,
    deleteCoupon
}