const User = require('../../model/userSchema')
const Order = require('../../model/orderSchema')
const Product = require('../../model/productSchema')
const Category = require('../../model/categorySchema')
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

                req.session.admin = {
                  _id: admin._id
                }
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
const renderDashboard = async (req, res)=>{
  try {
    res.render('admin/dashboard')
  } catch (error) {
    console.error('Error in loading dashboard: ', error)
  }
}

const dashboardData = async (req,res)=>{
    try {
       const { filter, fromDate, toDate, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const perPage = parseInt(limit);
    const skip = (pageNum - 1) * perPage;

    let startDate, endDate;
    const now = new Date();

    switch (filter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;

      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
        break;

      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;

      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;

      case 'custom':
        startDate = new Date(fromDate);
        endDate = new Date(toDate);
        break;

      default:
        startDate = new Date(0);
        endDate = new Date();
        break;
    }

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } }

    const totalCustomers = await User.countDocuments();
    const totalOrders = await Order.countDocuments({
        ...dateFilter, 
        paymentStatus: "Success"
    })
    const totalSales = await Order.countDocuments({...dateFilter, "items.orderStatus": {$nin: ['Cancelled', 'Returned']}})
    const totalRevenue = await Order.aggregate([
      { $match: {
        ...dateFilter,
      "items.orderStatus": { $nin: ["Cancelled", "Returned"] } 
      }
      },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } }
    ]);
    const totalRevenueAmount = totalRevenue[0]?.total || 0;

    const orders = await Order.find({...dateFilter, paymentStatus: 'Success'})
      .populate("userId", "fullname")
      .populate("items.productId", "productName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage) 

     const orderDetails = []

     orders.forEach(order => {
      const totalDeliveredPrice = order.items.reduce((sum, item) => sum + item.totalPrice, 0)
  order.items.forEach(item => {
    const product = item.productId;
    if (!product) return;
    let discount = item.regularPrice - item.price
    
    const couponShareTotal = order.couponDiscount ? (item.totalPrice / totalDeliveredPrice) * order.couponDiscount : 0
    const couponSharePerUnit = couponShareTotal / item.quantity

   const netAmount = item.quantity * (item.price - couponSharePerUnit)

    orderDetails.push({
      orderDate: order.createdAt,
      orderId: order.orderId,
      customer: order.userId?.fullname || "Unknown",
      productName: product.productName,
      quantity: item.quantity,
      mrp: item.regularPrice,
      discount: discount || 0,
      couponSharePerUnit: couponSharePerUnit.toFixed(2),
      netAmount: netAmount.toFixed(2),
      status: item.orderStatus
    });
  });
});

    const topProducts = await Order.aggregate([
  { $match: { ...dateFilter, "items.orderStatus": {$nin: ["Cancelled", "Returned"]} } },
  { $unwind: "$items" },
  {
    $group: {
      _id: "$items.productId",
      totalSold: { $sum: "$items.quantity" }
    }
  },
  { $sort: { totalSold: -1 } },
  { $limit: 10 },
  {
    $lookup: {
      from: "products",
      localField: "_id",
      foreignField: "_id",
      as: "productInfo"
    }
  },
  { $unwind: "$productInfo" },
  {
    $project: {
      _id: 0,
      productId: "$_id",
      productName: "$productInfo.productName",
      sold: "$totalSold" 
    }
  }
])

    const topCategories = await Order.aggregate([
  { $unwind: "$items" },
  { $match: { ...dateFilter, "items.orderStatus": {$nin: ["Cancelled", "Returned"]} } },
  {
    $lookup: {
      from: "products",
      localField: "items.productId",
      foreignField: "_id",
      as: "productInfo"
    }
  },
  { $unwind: "$productInfo" },
  {
    $group: {
      _id: "$productInfo.category",
      totalSold: { $sum: "$items.quantity" }
    }
  },
  { $sort: { totalSold: -1 } },
  { $limit: 10 },
  {
    $lookup: {
      from: "categories",
      localField: "_id",
      foreignField: "_id",
      as: "categoryInfo"
    }
  },
  {
    $project: {
      _id: 0,
      categoryId: "$_id",
      category: { $arrayElemAt: ["$categoryInfo.categoryName", 0] },
      sold: "$totalSold"
    }
  }
]);



    res.json({
      summary: {
        totalCustomers,
        totalOrders,
        totalRevenueAmount,
        totalSales
      },
      topProducts,
      topCategories,
      orderDetails,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / perPage),
      },
    })

    } catch (error) {
        console.log("Error loading dashboard: "+error)
    }
}


module.exports = {
    loadLogin,
    login,
    renderDashboard,
    dashboardData,
    logout
}



