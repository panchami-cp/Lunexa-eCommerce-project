const { redirect } = require('express/lib/response')
const Order = require('../../model/orderSchema')
const User = require('../../model/userSchema')
const Address = require('../../model/addressSchema')
const Cart = require('../../model/cartSchema')
const Wallet = require('../../model/walletSchema')

const listOrders = async (req, res)=>{
    try {
    let page = parseInt(req.query.page) || 1;
    const limit = 4;
    let skip = (page - 1) * limit;

    
    const search = req.query.search ? req.query.search.trim() : "";
    const sort = req.query.sort || "newest"; 
    const statusFilter = req.query.status || ""; 

    
    let query = {cancelled: false}

    if (search) {
        const users = await User.find({
            fullname: { $regex: search, $options: "i" }
        }).select("_id");
        query.userId = { $in: users.map(u => u._id) };
    }

    if (statusFilter) {
        query.status = statusFilter;
    }

    
    let sortOption = {};
    switch (sort) {
        case "oldest":
            sortOption = { createdOn: 1 };
            break;
        case "amountHigh":
            sortOption = { finalAmount: -1 };
            break;
        case "amountLow":
            sortOption = { finalAmount: 1 };
            break;
        default: 
            sortOption = { createdOn: -1 };
    }

    
    const orderData = await Order.find(query)
        .populate("userId")
        .populate("items.productId")
        .sort(sortOption)
        .skip(skip)
        .limit(limit);

    const count = await Order.countDocuments(query);

    res.render("admin/orders", {
        orderData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        search,
        sort,
        statusFilter
    });

} catch (error) {
    console.error("Error loading orders:", error);
    res.redirect("/pageNotFound");
}

}

const viewOrder = async (req, res)=>{
    try {


        const itemId = req.query.id

        const orderData = await Order.findOne({"items._id":itemId}).populate('items.productId').populate('userId')

        const orderEnum = Order.schema.path('items').schema.path('orderStatus').enumValues

        const remove = ['Cancelled', 'Returned']

        const orderStatus = orderEnum.filter((item)=> !remove.includes(item))

        if(!orderData){
            return res.redirect('/pageNotFound')
        }
        const item = orderData.items.find(item=> item._id.toString() === itemId.toString())

        if(!item){
            return res.redirect('/pageNotFound')
        }

        res.render('admin/orderDetails',{

            orderData: orderData,
            item,
            orderStatus,
            address: orderData.address
        })        


        
    } catch (error) {

        console.log('Error in view order details: ', error)

        res.redirect('/pageNotFound')
        
    }
}

const changeStatus = async (req, res)=>{

    try {

        const orderObjId = req.body.id
        const status = req.body.status
        const itemId = req.body.itemId

    const order = await Order.findById(orderObjId)

    if(!order){
        return res.json({success: false})
    }

    const item = order.items.find(item=> item._id.toString() === itemId.toString())

    if(!item){

        return res.redirect('/pageNotFound')

    }

    await Order.updateOne({"items._id": itemId}, {$set:{"items.$.orderStatus": status}})

    res.json({success: true})
        
    } catch (error) {

        console.error('Error in change status: ', error)

        res.json({success: false})
        
    }

    
}

const approveReturn = async (req, res)=>{
    try {
        const orderObjId = req.query.id
        const itemId = req.query.itemId
        const order = await Order.findById(orderObjId)

        if (!order) {
            return res.redirect('/pageNotFound')
        }

        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        
        if (!item.returnRequest || item.returnRequest.status !== "Pending") {

            return res.redirect('/pageNotFound')

        }

        if(item.orderStatus !== 'Delivered'){

            return res.redirect('/pageNotFound')

        }

        item.returnRequest.status = "Approved"
        item.orderStatus = "Returned"
        item.returnRequest.approvedAt = new Date()

        await order.save()

        return res.redirect(`/admin/return/refund?id=${order._id}&itemId=${itemId}`)

    } catch (err) {

        console.error("Error approving return:", err)
        res.redirect('/pageNotFound')

    }
}

const rejectReturn = async(req, res)=>{
   try {

    const orderObjId = req.query.id
    const itemId = req.query.itemId
    const order = await Order.findById(orderObjId)

    if (!order) {
        return res.redirect('/pageNotFound')
    }

    const item = order.items.find(item=> item._id.toString() === itemId.toString())

    if (!item.returnRequest || item.returnRequest.status !== "Pending") {
        return res.redirect('/pageNotFound')
    }

    if(item.orderStatus !== 'Delivered'){

        return res.redirect('/pageNotFound')
            
    }

    item.returnRequest.status = "Rejected";
    item.returnRequest.rejectedAt = new Date()

    await order.save()

    return res.redirect('/admin/orders')

} catch (err) {
    console.error("Error rejecting return:", err)
    return res.redirect('/pageNotFound')
}
}

const refundPage = async (req, res)=>{
    try {

        const orderObjId = req.query.id

        const refundItemId = req.query.itemId

        const order = await Order.findById(orderObjId).populate('userId')

        if(!order){
            return res.redirect('/pageNotFound')
        }

        const item = order.items.find(item=> item._id.toString() === refundItemId.toString())

        let refundAmount = item.totalPrice

        res.render('admin/refundPage',{
            order,
            item,
            refundAmount
        })
        
    } catch (error) {

        console.error("Error in loading refund page: ", error)
        res.redirect('/pageNotFound')
        
    }
}

const refund = async (req, res)=>{
    try {
        const orderId = req.query.id

        const itemId = req.query.itemId

        const { amount, method } = req.body

        const order = await Order.findById(orderId).populate('userId')

        if (!order) {
            return res.redirect('/pageNotFound')
        }

        const item = order.items.find(item=> item._id.toString() === itemId.toString())

        if (method !== 'wallet') {
            return res.status(400).send('Invalid refund method')
        }

        let wallet = await Wallet.findOne({ userId: order.userId._id })

        if (!wallet) {

            wallet = new Wallet({
                userId: order.userId._id,
                balance: 0,
                transactions: []
            });
        }

        const refundAmount = parseFloat(amount);
        wallet.balance += refundAmount;

        wallet.transactions.push({
            type: 'credit',
            amount: refundAmount
        })

        await wallet.save();

        item.returnRequest.status = 'Refunded'

        await order.save();

        res.redirect('/admin/orders');

    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
}


module.exports = {
    listOrders,
    viewOrder,
    changeStatus,
    approveReturn,
    rejectReturn,
    refundPage,
    refund
}