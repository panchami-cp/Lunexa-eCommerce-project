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
const Wallet = require('../../model/walletSchema')


const loadCheckout = async(req,res)=>{

    try {

        const userId = req.session.user

        const userData = await User.findById(userId)

        if(!userData){
            
            return res.redirect('/pageNotFound')
        }

        const wallet = await Wallet.findOne({userId: userId})

        const walletBalance = wallet? wallet.balance : 0

        const usedCouponIds = (userData.usedCoupon || []).map(c => c.couponId).filter(id => id !== null && id !== undefined)

        let today = new Date()
        
        const currentCoupons = await Coupon.find({
            _id: {$nin:usedCouponIds},
            startDate: {$lte: today},
            endDate: {$gte: today}
        }).sort({endDate:1})

        const cart = await Cart.findOne({userId: userId}).populate('items.productId')

        const findAddress = await Address.findOne({userId: userId})
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

        let applicableCoupon = currentCoupons.filter((coupon)=>{
           return  Number(cart.totalCartPrice) >= Number(coupon.minimumPrice)
        })

        if(!cart || cart.items.length === 0){

            return res.redirect('/cart')

        }else{

            const cartItems = cart.items.map((item)=>{
                const product = item.productId
                return{
                    productImage: product.productImage[0],
                    productName: product.productName,
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
                couponDiscount,
                walletBalance
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
                userId: userId,
                items: cart.items,
                totalMRP: cart.totalMRP,
                totalDiscount: cart.totalDiscount,
                couponDiscount: appliedCoupon? appliedCoupon. discountAmount : 0,
                finalAmount: finalAmount,
                address: orderAddress,
                coupon: appliedCoupon ? appliedCoupon.couponId : null
            })

        //cash on delivery
        if(paymentMethod === 'cashOnDelivery'){

            if(cart.totalCartPrice > 1000){
                return res.json({success: false, message: "Cash on delivery available only for orders upto Rs.1000"})
            }
            const orderId = uuidv4()

            newOrder.orderId = orderId
            newOrder.paymentMethod = "cashOnDelivery"
            newOrder.paymentStatus = 'Success'
           
            await newOrder.save()

            await updateProductStock(cart)

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

        //wallet
        const wallet = await Wallet.findOne({userId})
        
        if(paymentMethod === 'wallet'){

            if(!wallet || wallet.balance < finalAmount){
                return res.json({success: false, message: 'Cannot find wallet or insufficient balance in wallet'})
            }

            const orderId = uuidv4()
            newOrder.orderId = orderId
            newOrder.paymentMethod = 'wallet'
            newOrder.paymentStatus = 'Success'

            await newOrder.save()

            wallet.balance -= finalAmount
            wallet.transactions.push({
                type: 'debit',
                amount: finalAmount,
                description: 'order purchase',
                orderId,
                date: new Date()
            })
            await wallet.save()

            await updateProductStock(cart)

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

            newOrder.orderId = uuidv4();
            newOrder.razorpayOrderId = razorpayOrder.id
            newOrder.paymentMethod = 'razorpay'
            newOrder.paymentStatus = 'Pending'
            await newOrder.save()

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

async function updateProductStock(cart){

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
        const page = parseInt(req.query.page) || 1
        const limit = 3
        const skip = (page - 1) * limit
        const searchTerm = req.query.searchInput
        const userId = req.session.user

        let query = {userId: userId}

        let totalOrders = await Order.countDocuments(query)
        
        let orders = await Order.find(query)
        .populate('items.productId')
        .sort({createdOn: -1})
        .skip(skip)
        .limit(limit)
        .lean()

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
        
        const totalPages = Math.ceil(totalOrders/limit)

        if (!orders || orders.length === 0) {
            return res.render('user/viewOrders', {
                orders: [],
                currentPage: page,
                totalPages
            });
        }

        res.render('user/viewOrders', {
            orders,
            currentPage: page,
            totalPages,

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
        
            const updatedOrder = await Order.findById(order._id)

            const allCancelled = updatedOrder.items.every(item=> item.orderStatus === 'Cancelled')

        if (allCancelled) {
            await Order.updateOne(
                { _id: order._id },
                { $set: { cancelled: true } }
            );
        }

        if(order.paymentMethod === 'razorpay' || order.paymentMethod === 'wallet'){

            let refundAmount = item.totalPrice

            if(order.couponDiscount > 0){
                const totalSalePrice = order.totalMRP - order.totalDiscount
                const couponShare = (item.totalPrice/totalSalePrice) * order.couponDiscount
                refundAmount = item.totalPrice - couponShare
            }

            refundAmount = Math.round(refundAmount)

            let wallet = await Wallet.findOne({userId: order.userId})
            if(!wallet){
                wallet = new Wallet({
                    userId: order.userId,
                    balance: 0,
                    transactions: []
                })
            }
            wallet.balance += refundAmount
            wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: 'order cancelled',
                orderId: order.orderId,
                date: new Date()
            })

            await wallet.save()
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

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, retry } = req.body
        const userId = req.session.user

        const sign = razorpay_order_id + "|" + razorpay_payment_id
        const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex")

        if (razorpay_signature !== expectedSign) {
            await Order.updateOne({ razorpayOrderId: razorpay_order_id }, { $set: { paymentStatus: 'Failed' } })
            return res.json({ success: false, redirectUrl: '/payment_failure' })
        }

        const order = await Order.findOne({ razorpayOrderId: razorpay_order_id }).populate("items.productId");
        if (!order) {
            return res.json({ success: false, message: "Order not found" });
        }

        order.razorpayPaymentId = razorpay_payment_id
        order.paymentStatus = 'Success'
        await order.save()

         for (const item of order.items) {
            const product = item.productId;
            await Product.updateOne(
                { _id: product._id, "sizeVariant.size": item.size },
                { $inc: { "sizeVariant.$.quantity": -item.quantity, totalQuantity: -item.quantity } }
            )
        }

        if (!retry) {
            await Cart.updateOne({ userId }, {
                $set: { items: [], totalQuantity: 0, totalCartPrice: 0, totalMRP: 0, totalDiscount: 0 }
            });
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

        if (order.coupon) {
            await User.updateOne(
                { _id: userId },
                { $push: { usedCoupon: { couponId: order.coupon } } }
            )
            req.session.appliedCoupon = null
        }

        req.session.orderId = order.orderId

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

const cancelAllOrder = async (req, res)=>{
    try {

        const orderId = req.body.id
        const order = await Order.findById(orderId).populate('items.productId')
        
        if(!order){
            return res.redirect('/pageNotFound')
        }

        for(const item of order.items){
            await Product.updateOne(
                {_id: item.productId._id, 'sizeVariant.size': item.size},
                {$inc: { "sizeVariant.$.quantity": item.quantity, totalQuantity: item.quantity }}
            )

            const updatedProduct = await Product.findById(item.productId._id).select('totalQuantity');
            if (updatedProduct) {
                const status = updatedProduct.totalQuantity === 0 ? 'Out of stock' : 'In Stock';
                await Product.updateOne({ _id: item.productId._id }, { $set: { status } });
            }
        }

        await Order.updateOne(
            { _id: orderId },
            {$set: {"items.$[].orderStatus": "Cancelled", cancelled: true}}
        )

        if(order.paymentMethod === 'razorpay' || order.paymentMethod === 'wallet'){
             let wallet = await Wallet.findOne({ userId: order.userId })

            if (!wallet) {

                wallet = new Wallet({
                    userId: order.userId._id,
                    balance: 0,
                    transactions: []
                })
            }
            
            wallet.balance += order.finalAmount
            wallet.transactions.push({
                type: 'credit',
                amount: order.finalAmount,
                description: 'order cancelled',
                orderId: order.orderId,
                date: new Date(),
            })

            await wallet.save()
        }

        res.json({ success: true, redirectUrl: '/order'})
        
    } catch (error) {
        console.error(err);
        res.json({ success: false, redirectUrl: '/pageNotFound'})
    }
}

const returnAllOrder = async (req, res)=>{
    try {

        const orderId = req.body.id
        const reason = req.body.reason

        const order = await Order.findById(orderId)

        if(!order){
            return res.json({success: false, redirectUrl: '/pageNotFound'})
        }

        await Order.updateOne({_id: orderId},
            {$set: {'items.$[].returnRequest.status': 'Pending', 'items.$[].returnRequest.reason': reason}}
        )

        res.json({success: true, redirectUrl: '/order'})
        
    } catch (error) {
        console.error('Error in return all products: ',error)
        res.json({success: false, redirectUrl: '/pageNotFound'})   
    }
}

const retryPayment = async (req, res)=>{
    try {
    const { orderId } = req.body
    const userId = req.session.user

    const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId')
    if (!order) return res.json({ success: false, message: "Order not found" })

    if (!["Pending", "Failed"].includes(order.paymentStatus)) {
      return res.json({ success: false, message: "Payment already completed" })
    }
    for(let item of order.items){
       let product = item.productId
       let orderedSize = item.size
        let sizeVariant =  product.sizeVariant.find(variant => variant.size === orderedSize)
        if(sizeVariant.quantity === 0){
            return res.json({success: false, message: `The product ${product.productName}(${orderedSize}) is out of stock`})
        }
        if(sizeVariant.quantity < item.quantity){
            return res.json({success: false, message: `The product ${product.productName}(${orderedSize}) has only ${sizeVariant.quantity} items left`})
        }
    }
    const options = {
      amount: order.finalAmount * 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    }
    const razorpayOrder = await razorpay.orders.create(options)

    order.razorpayOrderId = razorpayOrder.id
    order.paymentStatus = "Pending"; 
    await order.save()

    return res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      razorpayOrderId: razorpayOrder.id,
    });
    } catch (error) {
         console.error(err);
        res.status(500).json({ success: false, message: "Server error" })
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
    paymentFail,
    cancelAllOrder,
    returnAllOrder,
    retryPayment
}