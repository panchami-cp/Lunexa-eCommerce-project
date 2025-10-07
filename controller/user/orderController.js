const User = require('../../model/userSchema')
const Cart = require('../../model/cartSchema')
const Address = require('../../model/addressSchema')
const Order = require('../../model/orderSchema')
const Product = require('../../model/productSchema')
const Coupon = require('../../model/couponSchema')
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const razorpay = require('../../config/razorpay')
const crypto = require('crypto')
const env = require('dotenv').config()
const { v4: uuidv4 } = require('uuid')
const { redirect } = require('express/lib/response')


const loadCheckout = async(req,res)=>{

    try {

        const userid = req.session.user

        const userData = await User.findById(userid)

        if(!userData){
            
            return res.redirect('/pageNotFound')
        }
        
        const coupons = await Coupon.find().sort({endDate:1})

        let today = new Date()
        today.setHours(0,0,0,0)

        let currentCoupons = coupons.filter((coupon)=>{
            let endDate = new Date(coupon.endDate)
            endDate.setHours(0,0,0,0)
            return endDate >= today
        })

        const cart = await Cart.findOne({userId: userid}).populate('items.productId')

        const findAddress = await Address.findOne({userId: userid})
        let addresses

        if(findAddress){

            addresses = findAddress.address

        }

        const priceDetails = {
            totalItems: cart.totalQuantity,
            totalMRP: cart.totalMRP,
            discount: cart.totalDiscount,
            finalAmount: cart.totalCartPrice
        }

        let couponDiscount = 0
        if(req.session.appliedCoupon){
            priceDetails.finalAmount = req.session.applicableCoupon?.payableAmount || cart.totalCartPrice
            couponDiscount = req.session.applicableCoupon?.discountAmount || 0
        }

        let applicableCoupon = coupons.filter((coupon)=>{
           return  Number(cart.totalCartPrice) >= Number(coupon.minimumPrice)
        })

        if(!cart || cart.items.length === 0){

            return res.redirect('/cart')

        }else{

            const cartItems = cart.items.map((item)=>{
                const product = item.productId
                

                return{
                    productImage: product.productImage[0],
                    quantity: item.quantity
                }
                
            })

            res.render('user/checkout', {
                cartData: cart,
                user: userData,
                cartItems,
                addresses,
                priceDetails,
                currentCoupons,
                applicableCoupon,
                couponDiscount
        
            })

        }

        
    } catch (error) {

        console.error('Error in loding checkout page: ', error)

        res.redirect('/pageNotFound')
        
    }
}

const placeOrder = async (req, res)=>{
    try {
        
        const addressId = req.body.addressId
        const paymentMethod = req.body.paymentMethod
        const userId = req.session.user

        const user = await User.findById(userId)
        if(!user){
            return res.json({success: false, redirectUrl: '/userNotFound'})
        }

        const cart = await Cart.findOne({userId: userId}).populate('items.productId')
        if(!cart || cart.items.length === 0){
           return res.status(400).json({success: false, message: 'Cart not found'})
        }  

        const selectedAddressDoc = await Address.findOne({'address._id':addressId},{'address.$':1})

        const selectedAddress = selectedAddressDoc.address[0]

        //stock validation
        let stockIssue = false

        for (const item of cart.items) {
        
            const product = item.productId
            const orderedSize = item.size
            const orderedQty = item.quantity

            const sizeVariant = product.sizeVariant.find((variant)=> variant.size === orderedSize)

            if(!sizeVariant || sizeVariant.quantity === 0){
                await Cart.updateOne({userId},{$pull:{items:{productId: product._id, size: orderedSize}}})
                
                stockIssue = true

                recalculateCart(userId)

            }else if(orderedQty > sizeVariant.quantity){

                const newQuantity = sizeVariant.quantity

                await Cart.updateOne({userId, "items.productId": product._id, "items.size": orderedSize},
                    {$set:{
                        "items.$.quantity": newQuantity,
                        "items.$.totalPrice": newQuantity * item.price,
                        "items.$.totalRegularPrice": newQuantity * item.regularPrice
                    }})

                stockIssue = true

                await recalculateCart(userId)

            }
    }

    if(stockIssue){
        req.flash('error', 'The product(s) were out of stock or insufficient. Your cart has been updated.')
        return res.json({success: false, redirectUrl: '/cart'})
    }

    //apply coupon
    let appliedCoupon = null

        if(req.session.appliedCoupon){
            appliedCoupon = {
                couponId : req.session.appliedCoupon.id,
                discountAmount: req.session.appliedCoupon.discountAmount
            }
        }

        const finalAmount = appliedCoupon ? req.session.appliedCoupon.payableAmount : cart.totalCartPrice

        //cash on delivery
        if(paymentMethod === 'cashOnDelivery'){
            const orderId = uuidv4()

            const orderAddress = {
                name: selectedAddress.name,
                building: selectedAddress.building,
                area: selectedAddress.area,
                landmark: selectedAddress.landmark,
                city: selectedAddress.city,
                state: selectedAddress.state,
                pincode: selectedAddress.pincode,
                phone: selectedAddress.phone,
                alternatePhone: selectedAddress.alternatePhone
            }

            const newOrder = new Order({
                orderId: orderId,
                userId: userId,
                items: cart.items,
                totalMRP: cart.totalMRP,
                totalDiscount: cart.totalDiscount,
                couponDiscount: appliedCoupon? appliedCoupon. discountAmount : 0,
                finalAmount: finalAmount,
                paymentMethod:"cashOnDelivery",
                address: orderAddress,
                coupon: appliedCoupon ? appliedCoupon.couponId : null
            })
            await newOrder.save()

             for(const item of cart.items){
                const product = item.productId
                const orderedSize = item.size
                const orderedQty = item.quantity

                await Product.updateOne(
                    { _id: product._id, 'sizeVariant.size': orderedSize },
                    { $inc: { 'sizeVariant.$.quantity': -orderedQty, totalQuantity: -orderedQty } }
                )

                const updatedProduct = await Product.findById(product._id).select('totalQuantity')
                
                if(updatedProduct){
                   const status = updatedProduct.totalQuantity === 0 ? 'Out of stock' : 'In Stock'
                   await Product.updateOne({_id: product._id}, {$set: {status: status}})
                }

            }

             await Cart.updateOne({userId: userId},{$set:{
                items:[], 
                totalQuantity:0,
                totalCartPrice:0,
                totalMRP:0,
                totalDiscount: 0
            }})

             if(appliedCoupon){
                await User.updateOne({_id: userId},{
                    $push:{usedCoupon: {couponId: appliedCoupon.couponId}}
                })
                req.session.appliedCoupon = null
            }

            req.session.orderId = orderId

            return res.json({success: true, redirectUrl: '/order_success'})
        }

        // razorpay
        if(paymentMethod === "razorpay"){
            const options = {
                amount: finalAmount * 100,
                currency: "INR",
                receipt: "rcpt_" + Date.now()
            }

            const razorpayOrder = await razorpay.orders.create(options)

            return res.json({
                success: true,
                key_id : process.env.RAZORPAY_KEY_ID,
                amount: razorpayOrder.amount,
                razorpayOrderId: razorpayOrder.id

            })
        }

        return res.json({success: false, message: "Invalid payment method"})
        
    } catch (error) {

        console.error('Error in place order:', error)
        res.status(500).json({success: false, redirectUrl:'/pageNotFound'})
        
    }
}

const recalculateCart = async(userId)=>{
     const cart = await Cart.findOne({ userId });

  if (!cart) return;

  let totalQuantity = 0;
  let totalCartPrice = 0;
  let totalMRP = 0;

  cart.items.forEach((item) => {
    totalQuantity += item.quantity;
    totalCartPrice += item.totalPrice;
    totalMRP += item.totalRegularPrice;
  });

  cart.totalQuantity = totalQuantity;
  cart.totalCartPrice = totalCartPrice;
  cart.totalMRP = totalMRP;
  cart.totalDiscount = totalMRP - totalCartPrice;

  await cart.save();
}


const orderSuccess = (req, res)=>{
    try {

        const orderId = req.session.orderId

        if(!orderId){
            return res.redirect('/pageNotFound')
        }

        res.render('user/orderSuccess',{orderId: orderId})
        
    } catch (error) {
        
        console.error('Error in loding order success page: ',error)
        res.redirect('/pageNotFound')
    }
}

const viewOrder = async (req, res)=>{
    try {
        const searchTerm = req.query.searchInput
        const userId = req.session.user
        
        let orders = await Order.find({userId: userId}).populate('items.productId').sort({createdOn: -1})
        
        orders = orders.filter(order => Array.isArray(order.items) && order.items.length > 0)

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase()

            orders = orders.filter(order =>
                order.orderId?.toLowerCase().includes(lowerSearch) ||
                (Array.isArray(order.items) &&
                order.items.some(item =>
                    item.productId?.productName?.toLowerCase().includes(lowerSearch)
                )
                )
            )
        }

       
        if (!orders || orders.length === 0) {
            return res.render('user/viewOrders', {
                orders: []
            });
        }

        res.render('user/viewOrders', {
            orders
        });

    } catch (error) {
        console.error('Error loading orders: ', error);
        res.redirect('/pageNotFound');
    }
}

const orderDetails = async (req,res)=>{
    try {

        const itemId = req.query.id

        const order = await Order.findOne({"items._id":itemId}).populate('items.productId')

        if(!order){

            // return res.redirect('/pageNotFound')
            return res.send('order not found')

        }

        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        if(!item){
            // return res.redirect('/pageNotFound')
            return res.send('item not found')
        }

        res.render('user/orderDetails',{
            order,
            item
        })
        
    } catch (error) {
        console.error('Error in load order details: ', error)
        res.redirect('/pageNotFound')
    }
}

const loadCancelOrder = async (req, res)=>{
    try {

        const itemId = req.query.id

        const order = await Order.findOne({"items._id":itemId}).populate('items.productId')

        if(!order){

            return res.redirect('/pageNotFound')
        }

        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        if(!item){
            return res.redirect('/pageNotFound')
        }

        res.render('user/orderCancelPage',{
            order,
            item
        })
        
    } catch (error) {
        console.error("Error in load cancel page: ", error)
        res.redirect('/pageNotFound')
    }
}

const cancelOrder = async(req, res)=>{
    try {

        const itemId = req.body.itemId

        const order = await Order.findOne({"items._id":itemId}).populate('items.productId');

        if (!order) {

            return res.json({success: false, redirectUrl:"/pageNotFound"})
        }

        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        if(!item){
           return res.json({ success: false, redirectUrl: "/pageNotFound" })
        }

       
                await Product.updateOne(
                    { _id: item.productId._id, "sizeVariant.size": item.size },
                    { $inc: { "sizeVariant.$.quantity": item.quantity, totalQuantity: item.quantity } }
                )

                const updatedProduct = await Product.findById(item.productId._id).select('totalQuantity')

                if(updatedProduct){
                    const status = updatedProduct.totalQuantity === 0 ? 'Out of stock' : 'In Stock'
                    await Product.updateOne({_id: item.productId._id}, {$set:{status: status}})
                }
        
            await Order.updateOne(
                {"items._id": itemId},
                { $set:{"items.$.orderStatus":"Cancelled"} }
            )
        
            const updatedOrder = await Order.findById(order._id);

        if (updatedOrder.items.length === 0) {
            await Order.updateOne(
                { _id: order._id },
                { $set: { cancelled: true } }
            );
        }

        res.json({success: true, message: "Item cancelled successfully"})
        
    } catch (error) {

        console.error("Error in cancel order: ", error)
        res.json({success: false, redirectUrl: "/pageNotFound"})
        
    }
}

const returnOrderPage = async(req, res)=>{
    try {

        const itemId = req.query.id

        const order = await Order.findOne({"items._id": itemId}).populate('items.productId')

        if(!order){

            return res.redirect('/pageNotFound')
        }
        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        if(!item){
            return res.redirect('/pageNotFound')
        }

        res.render('user/orderReturnPage',{
            order, 
            item
        })
        
    } catch (error) {

        console.error("Error in load return page: ", error)
        res.redirect('/pageNotFound')
    }
}

const returnOrder = async(req, res)=>{
    try {

        const itemId = req.body.itemId

        const reason = req.body.reason

         await Order.updateOne({"items._id": itemId},{$set:{
            "items.$.returnRequest":{
                status: 'Pending',
                reason,
                requestedAt: new Date()
            }
         }});

        res.redirect('/orders')


        
    } catch (error) {

        console.error("Error in request return: ", error)

        res.redirect('/pageNotFound')
        
    }
}


//generate pdf file

function generateInvoice(order, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(20).text('Invoice', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Order ID: ${order._id}`);
      doc.text(`Date: ${new Date(order.createdOn).toLocaleDateString()}`);
      doc.text(`Customer: ${order.userId.fullname}`);
      doc.text(`Email: ${order.userId.email}`);
      doc.moveDown();

       const includedItems = order.items.filter(item => {
        return !['Cancelled', 'Returned'].includes(item.orderStatus);
      });

      let recalculatedTotal = 0

      includedItems.forEach(item => {
        const itemTotal = item.price * item.quantity;
        recalculatedTotal += itemTotal;
        doc.text(`${item.productId.productName} x ${item.quantity} - Rs.${itemTotal}`)
      });

      doc.moveDown();
      doc.fontSize(14).text(`Total: Rs.${recalculatedTotal}/-`, { align: 'right' })

      doc.end();

      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

const downloadInvoice = async (req, res)=>{
    try {

        const orderObjId = req.query.id

        const order = await Order.findById(orderObjId).populate('userId').populate('items.productId')

        const filePath = path.join(process.cwd(), 'public', 'invoices', `invoice-${order._id}.pdf`);

        await generateInvoice(order, filePath)

        res.download(filePath)
        
    } catch (error) {

        console.log('Error in download invoice: ',error)
        res.redirect('/pageNotFound')
        
    }
}

const applyCoupon = async (req, res)=>{
    try {

        const {cartId, couponId} = req.body

        const cart = await Cart.findById(cartId)
        const coupon = await Coupon.findById(couponId)

        if(!cart){
            return res.json({success: false})
        }
        if(!coupon){
            return res.json({success: false})
        }

        let cartTotal = cart.totalCartPrice
        let offerType = coupon.offerType
        let payableAmount = 0
        let discountAmount = 0

        if(offerType === "percentage"){
            let offerPercentage = coupon.offerPercentage
            payableAmount = Math.floor((cartTotal * (100 - offerPercentage)) / 100)
            discountAmount = cartTotal - payableAmount
        }
        if(offerType === "flat"){
            let flatOffer = coupon.flatOffer
            payableAmount = cartTotal - flatOffer
            discountAmount = cartTotal - payableAmount
        }

        req.session.appliedCoupon = {
            id: coupon._id,
            discountAmount,
            payableAmount
        }

        return res.json({ success: true, payableAmount, discountAmount })

    } catch (error) {
        console.error("Errorn in apply coupon: ",error)
        return res.json({success: false})
    }
}

const removeCoupon = async (req, res)=>{
    try {

        const {cartId, couponId} = req.body

        const cart = await Cart.findById(cartId)
        const coupon = await Coupon.findById(couponId)

        if(!cart) return res.json({success: false})
        
        if(!coupon) return res.json({success: false})

        if (!req.session.appliedCoupon) {
            return res.json({ success: false, message: "No coupon applied" });
        }

        if (req.session.appliedCoupon.id.toString() !== couponId.toString()) {
            return res.json({ success: false, message: "Invalid coupon removal" });
        }

        req.session.appliedCoupon = null;

    return res.json({
      success: true,
      payableAmount: cart.totalCartPrice,
      discountAmount: 0,                   
      message: "Coupon removed successfully"
    });
        
    } catch (error) {
         console.error("Error in remove coupon: ",error)
         return res.redirect('/pageNotFound')
    }
}

const verifyPayment = async (req, res)=>{
    try {

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId } = req.body
        const userId = req.session.user

        const sign = razorpay_order_id + "|" + razorpay_payment_id
        const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex")

        if (razorpay_signature !== expectedSign) {
            return res.json({ success: false, redirectUrl: '/payment_failure' })
        }

        const cart = await Cart.findOne({ userId }).populate("items.productId")
        if (!cart || cart.items.length === 0) {
            return res.json({ success: false, message: "Cart is empty" })
        }

        const selectedAddressDoc = await Address.findOne(
            { "address._id": addressId },
            { "address.$": 1 }
        )
        const selectedAddress = selectedAddressDoc.address[0]

        let appliedCoupon = null
        if (req.session.appliedCoupon) {
            appliedCoupon = {
                couponId: req.session.appliedCoupon.id,
                discountAmount: req.session.appliedCoupon.discountAmount,
            }
        }

        const finalAmount = appliedCoupon ? req.session.appliedCoupon.payableAmount : cart.totalCartPrice

        const orderId = uuidv4()
        const orderAddress = {
                name: selectedAddress.name,
                building: selectedAddress.building,
                area: selectedAddress.area,
                landmark: selectedAddress.landmark,
                city: selectedAddress.city,
                state: selectedAddress.state,
                pincode: selectedAddress.pincode,
                phone: selectedAddress.phone,
                alternatePhone: selectedAddress.alternatePhone
            }

        const newOrder = new Order({
            orderId,
            userId,
            items: cart.items,
            totalMRP: cart.totalMRP,
            totalDiscount: cart.totalDiscount,
            couponDiscount: appliedCoupon ? appliedCoupon.discountAmount : 0,
            finalAmount,
            paymentMethod: "razorpay",
            address: orderAddress,
            coupon: appliedCoupon ? appliedCoupon.couponId : null,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
        })

        await newOrder.save()

        for (const item of cart.items) {
            const product = item.productId
            const orderedSize = item.size
            const orderedQty = item.quantity

            await Product.updateOne(
                { _id: product._id, "sizeVariant.size": orderedSize },
                { $inc: { "sizeVariant.$.quantity": -orderedQty, totalQuantity: -orderedQty } }
            )
        }

        await Cart.updateOne(
            { userId },
            {
                $set: {
                items: [],
                totalQuantity: 0,
                totalCartPrice: 0,
                totalMRP: 0,
                totalDiscount: 0,
            },
            }
        )

        if (appliedCoupon) {
            await User.updateOne(
                { _id: userId },
                { $push: { usedCoupon: { couponId: appliedCoupon.couponId } } }
            )
            req.session.appliedCoupon = null
        }

        req.session.orderId = orderId

        return res.json({ success: true, redirectUrl: "/order_success" })
        
    } catch (error) {
        console.error("Error verifying payment:", error)
        return res.json({ success: false, redirectUrl: '/payment_failure' })
    }
}

const paymentFail = async (req, res)=>{
    try {
        
        res.render('user/paymentFail')
    } catch (error) {
        
    }
}


module.exports = {
    loadCheckout,
    placeOrder,
    orderSuccess,
    viewOrder,
    orderDetails,
    loadCancelOrder,
    cancelOrder,
    returnOrderPage,
    returnOrder,
    downloadInvoice,
    applyCoupon,
    removeCoupon,
    verifyPayment,
    paymentFail
}