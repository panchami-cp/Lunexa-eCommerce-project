const { redirect } = require('express/lib/response')
const Order = require('../../model/orderSchema')
const User = require('../../model/userSchema')
const Address = require('../../model/addressSchema')
const Cart = require('../../model/cartSchema')
const Wallet = require('../../model/walletSchema')
const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')

const listOrders = async (req, res)=>{
    try {
    let page = parseInt(req.query.page) || 1
    const limit = 4
    let skip = (page - 1) * limit

    const search = req.query.search ? req.query.search.trim() : ""
    const sort = req.query.sort || "newest"
    const statusFilter = req.query.status || ""
    
    let query = {}

    if (search) {
        const users = await User.find({
            fullname: { $regex: search, $options: "i" }
        }).select("_id")
        query.userId = { $in: users.map(u => u._id) }
    }

    if (statusFilter) {
        query["items"]  = { $elemMatch: { orderStatus: statusFilter } }
    }

let sortOption = {}
switch (sort) {
    case "oldest":
        sortOption = { createdOn: 1 }
        break
    case "amountHigh":
        sortOption = { finalAmount: -1 }
        break
    case "amountLow":
        sortOption = { finalAmount: 1 }
        break
    default:
        sortOption = { createdOn: -1 }
}

const orderData = await Order.find(query)
    .populate("userId")
    .populate("items.productId")
    .sort(sortOption)
    .skip(skip)
    .limit(limit)
    .lean()

if(statusFilter){
    orderData.forEach(order=>{
        order.items = order.items.filter(item=> item.orderStatus === statusFilter)
    })
}
const count = await Order.countDocuments(query)

res.render("admin/orders", {
    orderData,
    currentPage: page,
    totalPages: Math.ceil(count / limit),
    search,
    sort,
    statusFilter,
})


} catch (error) {
    console.error("Error loading orders:", error)
    res.redirect("/pageNotFound")
}

}

const viewOrder = async (req, res)=>{
    try {

        const orderId = req.query.id

        const orderData = await Order.findById(orderId).populate('items.productId').populate('userId')

        const orderEnum = Order.schema.path('items').schema.path('orderStatus').enumValues

        const remove = ['Cancelled', 'Returned']

        const orderStatus = orderEnum.filter((item)=> !remove.includes(item))

        if(!orderData){
            return res.redirect('/pageNotFound')
        }

        res.render('admin/orderDetails',{

            orderData: orderData,
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
        const deliveryDate = req.body.deliveryDate
        const itemId = req.body.itemId

        console.log(deliveryDate)

    const order = await Order.findById(orderObjId)

    if(!order){
        return res.json({success: false})
    }

    const item = order.items.find(item=> item._id.toString() === itemId.toString())

    if(!item){

        return res.redirect('/pageNotFound')

    }

    await Order.updateOne({"items._id": itemId}, {$set:{"items.$.orderStatus": status, "items.$.deliveryDate": deliveryDate}})

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


        let refundAmount = 0
        let item = null
        let isFullRefund = false

        //partial refund
        if(refundItemId){
            item = order.items.find(item=> item._id.toString() === refundItemId.toString())

            if(!item){
                return res.redirect('/pageNotFound')
            }    
                refundAmount = item.totalPrice

                if(order.couponDiscount > 0){
                    const totalSalePrice = order.totalMRP - order.totalDiscount
                    const couponShare = (item.totalPrice/totalSalePrice) * order.couponDiscount
                    refundAmount = item.totalPrice - couponShare
                }
                refundAmount = Math.round(refundAmount)
            
            //full refund
        }else{
            isFullRefund = true
            
            refundAmount = order.finalAmount
        }

        res.render('admin/refundPage',{
            order,
            item,
            refundAmount,
            isFullRefund
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

        const refundAmount = parseFloat(amount)
        wallet.balance += refundAmount

        wallet.transactions.push({
            type: 'credit',
            amount: refundAmount
        })

        
        if(itemId){
            const item = order.items.find(item=> item._id.toString() === itemId.toString())
            if(!item){
                return res.redirect('/pageNotFound')
            }
            item.returnRequest.status = 'Refunded'
        }else{
            order.items.forEach(item=>{
                if(item.returnRequest && item.returnRequest.status !== 'Refunded'){
                    item.returnRequest.status = 'Refunded'
                }
            })
        }

        
        await wallet.save();
        await order.save();

        res.redirect('/admin/orders');

    } catch (error) {
        console.error(error);
        res.redirect('/pageNotFound');
    }
}

const approveAllReturn = async (req, res)=>{
    try {

        const orderId = req.query.id
    
        const order = await Order.findById(orderId)

        if (!order) {
            return res.redirect('/pageNotFound')
        }

        const allEligible = order.items.every(item => {
            return (
                item.returnRequest &&
                item.returnRequest.status === 'Pending' &&
                item.orderStatus === 'Delivered'
            )
        })

        if(!allEligible){
            res.redirect('/pageNotFound')
        }

        await Order.updateOne({_id: orderId},
            {$set: {
                "items.$[].returnRequest.status": 'Approved',
                "items.$[].orderStatus": 'Returned'
            }}
        )

        return res.redirect(`/admin/return/refund?id=${order._id}`)

    } catch (error) {
        console.error('Error in approve all return requests: ',error)
        res.redirect('/pageNotFound')
    }
}

const generateExcelReport = async (req, res) => {
  try {
    const { search, sort, dateFilter, startDate, endDate } = req.query;

    let query = buildOrderQuery({ search: search?.trim() || "", dateFilter, startDate, endDate });

    if (search) {
      const users = await User.find({ fullname: { $regex: search, $options: "i" } }).select("_id");
      query.userId.$in = users.map((u) => u._id);
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

    const orders = await Order.find(query)
      .populate("userId")
      .populate("items.productId")
      .sort(sortOption)
      .lean();

    if (!orders.length) {
      return res.status(404).json({ message: "No orders found" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Report");

    worksheet.columns = [
      { header: "Order ID", key: "orderId", width: 25 },
      { header: "Order Date", key: "orderDate", width: 20 },
      { header: "Customer", key: "customer", width: 25 },
      { header: "Product", key: "product", width: 30 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "MRP (₹)", key: "mrp", width: 15 },
      { header: "Selling Price (₹)", key: "price", width: 15 },
      { header: "Discount (₹)", key: "discount", width: 15 },
      { header: "Coupon Share (₹)", key: "couponShare", width: 15 },
      { header: "Net Amount (₹)", key: "netAmount", width: 15 },
    ];

    let totalQty = 0;
    let totalMrp = 0;
    let totalDiscount = 0;
    let totalCoupon = 0;
    let totalNet = 0;

    orders.forEach((order) => {

      const deliveredItems = order.items.filter((i) => i.orderStatus === "Delivered");

      const totalDeliveredPrice = deliveredItems.reduce((sum, i) => sum + i.totalPrice, 0);

      deliveredItems.forEach((item) => {
        const discountPerUnit = item.regularPrice - item.price;
        const totalDiscountItem = discountPerUnit * item.quantity;

        const couponShareTotal = order.couponDiscount
          ? (item.totalPrice / totalDeliveredPrice) * order.couponDiscount
          : 0;
        const couponSharePerUnit = couponShareTotal / item.quantity;

        const netAmount = item.quantity * (item.price - couponSharePerUnit);

        worksheet.addRow({
          orderId: order._id,
          orderDate: new Date(order.createdOn).toLocaleDateString("en-GB"),
          customer: order.userId?.fullname || "Unknown",
          product: item.productId?.productName || "N/A",
          quantity: item.quantity,
          mrp: item.regularPrice.toFixed(2),
          price: item.price.toFixed(2),
          discount: totalDiscountItem.toFixed(2),
          couponShare: couponShareTotal.toFixed(2),
          netAmount: netAmount.toFixed(2),
        });

        totalQty += item.quantity;
        totalMrp += item.regularPrice * item.quantity;
        totalDiscount += totalDiscountItem;
        totalCoupon += couponShareTotal;
      });

      totalNet += order.finalAmount || 0;
    });

    worksheet.addRow({});
    worksheet.addRow({
      orderId: "TOTAL",
      quantity: totalQty,
      mrp: totalMrp.toFixed(2),
      discount: totalDiscount.toFixed(2),
      couponShare: totalCoupon.toFixed(2),
      netAmount: totalNet.toFixed(2),
    });

    const lastRow = worksheet.lastRow;
    lastRow.font = { bold: true };
    lastRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE6F0FF" },
      };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
      };
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=sales_report.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Excel Report Error:", error);
    res.status(500).json({ message: "Server Error while generating Excel" });
  }
}

const generatePdfReport = async (req, res) => {
  try {
    const { search, sort, dateFilter, startDate, endDate } = req.query;

    let query = buildOrderQuery({ search: search?.trim() || "", dateFilter, startDate, endDate });

    if (search) {
      const users = await User.find({ fullname: { $regex: search, $options: "i" } }).select("_id");
      query.userId.$in = users.map((u) => u._id);
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

    const orders = await Order.find(query)
      .populate("userId")
      .populate("items.productId")
      .sort(sortOption)
      .lean();

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=sales_report.pdf");
    doc.pipe(res);

    // --- Title ---
    doc.fontSize(20).font("Helvetica-Bold").text("Sales Report", { align: "center" });
    doc.moveDown(1.5);

    // --- Table Config ---
    const tableTop = 100;
    const rowHeight = 22;
    let yPos = tableTop;
    doc.fontSize(9); // 🔹 slightly smaller for better fit

    const headers = [
      "Order ID", "Date", "Customer", "Product",
      "Qty", "MRP", "Price", "Discount", "Coupon", "Net Amt"
    ];

    // 🔹 Adjusted to total ≈ 505 points (fits perfectly)
    const columnWidths = [70, 55, 80, 90, 35, 45, 45, 45, 45, 55];
    const totalWidth = columnWidths.reduce((a, b) => a + b, 0);
    const leftMargin = (doc.page.width - totalWidth) / 2;

    // --- Draw Header Row ---
    let x = leftMargin;
    headers.forEach((header, i) => {
      doc
        .font("Helvetica-Bold")
        .text(header, x + 2, yPos, { width: columnWidths[i], align: "center" });
      x += columnWidths[i];
    });

    doc.moveTo(leftMargin, yPos + rowHeight - 5).lineTo(leftMargin + totalWidth, yPos + rowHeight - 5).stroke();
    yPos += rowHeight;

    // --- Totals ---
    let totalQty = 0, totalMRP = 0, totalDiscount = 0, totalCoupon = 0, totalNet = 0;

    // --- Rows ---
    orders.forEach((order, orderIndex) => {
      const deliveredItems = order.items.filter((i) => i.orderStatus === "Delivered");
      const totalDeliveredPrice = deliveredItems.reduce((sum, i) => sum + i.totalPrice, 0);

      deliveredItems.forEach((item, idx) => {
        const discountPerUnit = item.regularPrice - item.price;
        const totalDiscountItem = discountPerUnit * item.quantity;
        const couponShareTotal = order.couponDiscount
          ? (item.totalPrice / totalDeliveredPrice) * order.couponDiscount
          : 0;
        const netAmount = item.quantity * (item.price - couponShareTotal / item.quantity);

        // Alternate row background
        if ((orderIndex + idx) % 2 === 0) {
          doc.rect(leftMargin, yPos - 2, totalWidth, rowHeight).fill("#F9F9F9").fillColor("black");
        }

        const rowValues = [
          order.orderId,
          new Date(order.createdOn).toLocaleDateString("en-GB"),
          order.userId?.fullname || "Guest",
          item.productId?.productName || "N/A",
          item.quantity,
          item.regularPrice.toFixed(2),
          item.price.toFixed(2),
          totalDiscountItem.toFixed(2),
          couponShareTotal.toFixed(2),
          netAmount.toFixed(2),
        ];

        x = leftMargin;
        rowValues.forEach((val, i) => {
          const isNumeric = i >= 4;
          doc.text(val.toString(), x + (isNumeric ? 0 : 2), yPos, {
            width: columnWidths[i] - 3,
            align: isNumeric ? "right" : "left",
          });
          x += columnWidths[i];
        });

        yPos += rowHeight;
        if (yPos > doc.page.height - 60) {
          doc.addPage();
          yPos = tableTop;
        }

        totalQty += item.quantity;
        totalMRP += item.regularPrice * item.quantity;
        totalDiscount += totalDiscountItem;
        totalCoupon += couponShareTotal;
      });

      totalNet += order.finalAmount || 0;
    });

    // --- Totals Row ---
    yPos += 5;
    doc.moveTo(leftMargin, yPos).lineTo(leftMargin + totalWidth, yPos).stroke();
    yPos += 5;

    const totalValues = [
      "TOTAL", "", "", "", totalQty,
      totalMRP.toFixed(2), "", totalDiscount.toFixed(2),
      totalCoupon.toFixed(2), totalNet.toFixed(2)
    ];

    x = leftMargin;
    totalValues.forEach((val, i) => {
      const isNumeric = i >= 4;
      doc.font("Helvetica-Bold").text(val.toString(), x + (isNumeric ? 0 : 2), yPos, {
        width: columnWidths[i] - 3,
        align: isNumeric ? "right" : "left",
      });
      x += columnWidths[i];
    });

    doc.end();
  } catch (error) {
    console.error("PDF Report Error:", error);
    res.redirect("/pageNotFound");
  }
};




function buildOrderQuery({ search, dateFilter, startDate, endDate }) {
    const query = {};

    if (search) {
        query.userId = { $in: [] };
    }

    query["items"] = { $elemMatch: { orderStatus: "Delivered" } };

    if (dateFilter) {
        let start, end;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        switch (dateFilter) {
            case "today":
                start = new Date(today);
                end = new Date(today);
                end.setHours(23, 59, 59, 999);
                break;

            case "week":
                const dayOfWeek = today.getDay();
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                start = new Date(today);
                start.setDate(today.getDate() - diffToMonday);
                end = new Date(today);
                end.setHours(23, 59, 59, 999);
                break;

            case "year":
                start = new Date(today.getFullYear(), 0, 1);
                end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
                break;

            case "custom":
                if (startDate && endDate) {
                    start = new Date(startDate);
                    start.setHours(0, 0, 0, 0);
                    end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                }
                break;
        }

        if (start && end) {
            query.createdOn = { $gte: start, $lte: end };
        }
    }

    return query;
}


const loadSalesReport = async (req, res)=>{
    try {
    let page = parseInt(req.query.page) || 1
    const limit = 8
    let skip = (page - 1) * limit
    const search = req.query.search ? req.query.search.trim() : ""
    const sort = req.query.sort || "newest"
    const dateFilter = req.query.dateFilter || ""
    const startDate = req.query.startDate
    const endDate = req.query.endDate

    let query = {}

    if (search) {
        const users = await User.find({
            fullname: { $regex: search, $options: "i" }
        }).select("_id")
        query.userId = { $in: users.map(u => u._id) }
    }

    if (dateFilter) {
        let start, end
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        switch (dateFilter) {
            case "today":
                start = new Date(today)
                end = new Date(today)
                end.setHours(23, 59, 59, 999)
                break

            case "week":
                const dayOfWeek = today.getDay() 
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
                start = new Date(today)
                start.setDate(today.getDate() - diffToMonday)
                end = new Date(today)
                end.setHours(23, 59, 59, 999)
                break

            case "year":
                start = new Date(today.getFullYear(), 0, 1)
                end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999)
                break

            case "custom":
                if (startDate && endDate) {
                    start = new Date(startDate)
                    start.setHours(0, 0, 0, 0)
                    end = new Date(endDate)
                    end.setHours(23, 59, 59, 999)
                }
                break
        }

        if (start && end) {
            query.createdOn = { $gte: start, $lte: end }
        }
    }

    query.items = { $elemMatch: { orderStatus: "Delivered" } } 

let sortOption = {}
switch (sort) {
    case "oldest":
        sortOption = { createdOn: 1 }
        break
    case "amountHigh":
        sortOption = { finalAmount: -1 }
        break
    case "amountLow":
        sortOption = { finalAmount: 1 }
        break
    default:
        sortOption = { createdOn: -1 }
}

const orderData = await Order.find(query)
    .populate("userId")
    .populate("items.productId")
    .sort(sortOption)
    .skip(skip)
    .limit(limit)
    .lean()
let totalQuantity = 0
let totalMRP = 0
let totalDiscount = 0
let totalCoupon = 0
let totalNetAmount = 0

orderData.forEach(order => {
  order.items = order.items.filter(item => item.orderStatus === "Delivered");

  const totalDeliveredPrice = order.items.reduce((sum, item) => sum + item.totalPrice, 0)

  order.items = order.items.map(item => {
    const discountPerUnit = item.regularPrice - item.price;
    const totalDiscountValue = discountPerUnit * item.quantity;

    const couponShareTotal = order.couponDiscount ? (item.totalPrice / totalDeliveredPrice) * order.couponDiscount : 0

    const couponSharePerUnit = couponShareTotal / item.quantity;

    const netAmount = item.quantity * (item.price - couponSharePerUnit);

    totalQuantity += item.quantity;
    totalMRP += item.regularPrice * item.quantity;
    totalDiscount += totalDiscountValue;
    totalCoupon += couponShareTotal;
    totalNetAmount += netAmount;

    return {
      ...item,
      discountPerUnit,
        totalDiscount: totalDiscountValue.toFixed(2),
        couponShareTotal: couponShareTotal.toFixed(2),
      couponSharePerUnit: couponSharePerUnit.toFixed(2),
      netAmount: netAmount.toFixed(2)
    }
  })
})

const count = await Order.countDocuments(query)

res.render("admin/salesReport", {
    orderData,
    totalQuantity,
    totalMRP: totalMRP.toFixed(2),
    totalDiscount: totalDiscount.toFixed(2),
    totalCoupon: totalCoupon.toFixed(2),
    totalNetAmount: totalNetAmount.toFixed(2),
    currentPage: page,
    totalPages: Math.ceil(count / limit),
    search,
    sort,
    dateFilter,
    startDate,
    endDate,
})
        
    } catch (error) {
        console.error("Error in loading sales report page: ", error)
        res.redirect('/pageNotFound')
    }
}


module.exports = {
    listOrders,
    viewOrder,
    changeStatus,
    approveReturn,
    rejectReturn,
    refundPage,
    refund,
    approveAllReturn,
    generateExcelReport,
    generatePdfReport,
    loadSalesReport
}