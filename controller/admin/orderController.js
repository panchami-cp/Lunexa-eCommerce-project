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

    if (statusFilter) {
        query["items"]  = { $elemMatch: { orderStatus: statusFilter } }
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
    dateFilter,
    startDate,
    endDate
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

const generateExcelReport = async (req, res)=>{
    try {

        const { search, sort, status, dateFilter, startDate, endDate } = req.query;

        let query = buildOrderQuery({
            search: search?.trim() || "",
            statusFilter: status || "",
            dateFilter,
            startDate,
            endDate
        });

        if (search) {
            const users = await User.find({
                fullname: { $regex: search, $options: "i" }
            }).select("_id");
            query.userId.$in = users.map(u => u._id);
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

        if (status) {
            orders.forEach(order => {
                order.items = order.items.filter(item => item.orderStatus === status);
            });
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Sales Report");

        worksheet.columns = [
            { header: "Order ID", key: "orderId", width: 25 },
            { header: "Date", key: "date", width: 15 },
            { header: "Customer", key: "customer", width: 20 },
            { header: "Product", key: "product", width: 25 },
            { header: "Qty", key: "qty", width: 10 },
            { header: "Price", key: "price", width: 12 },
            { header: "Discount", key: "discount", width: 12 },
            { header: "Coupon", key: "coupon", width: 12 },
            { header: "Total", key: "total", width: 15 },
            { header: "Payment", key: "payment", width: 15 },
            { header: "Status", key: "status", width: 15 },
        ];

        let totalQty = 0;
        let totalDiscount = 0;
        let totalCoupon = 0;
        let totalSales = 0;

        orders.forEach(order => {
             const totalMRP = order.items.reduce((acc, item) => acc + (item.regularPrice * item.quantity), 0);
            const totalDiscountAmt = order.items.reduce((acc, item) => acc + ((item.regularPrice - item.price) * item.quantity), 0);
            const totalSalePrice = totalMRP - totalDiscountAmt;  // Total after discounts but before coupon
            const couponDiscountTotal = order.couponDiscount || 0;

            order.items.forEach(item => {

                const itemDiscount = (item.regularPrice - item.price) * item.quantity
                let itemCouponShare = 0;

                if (couponDiscountTotal > 0 && totalSalePrice > 0) {
                    const itemSalePrice = item.price * item.quantity;
                    itemCouponShare = (itemSalePrice / totalSalePrice) * couponDiscountTotal;
                }

                worksheet.addRow({
                     orderId: order._id.toString(),
                    date: new Date(order.createdOn).toLocaleDateString(),
                    customer: order.userId?.fullname || "Guest",
                    product: item.productId?.productName || "N/A",
                    qty: item.quantity,
                    price: item.price.toFixed(2),
                    discount: itemDiscount.toFixed(2),
                    coupon: itemCouponShare.toFixed(2),
                    total: item.totalPrice.toFixed(2),
                    payment: order.paymentMethod,
                    status: item.orderStatus
                });

                totalQty += item.quantity;
                totalDiscount += itemDiscount;
                totalCoupon += itemCouponShare;
                totalSales += item.totalPrice;
            });
        });

        const totalRow = worksheet.addRow({
            orderId: "TOTAL",
            qty: totalQty,
            discount: totalDiscount.toFixed(2),
            coupon: totalCoupon.toFixed(2),
            total: totalSales.toFixed(2),
        });

        totalRow.font = { bold: true };
        totalRow.eachCell(cell => {
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFE5E5E5" }
            };
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=" + "sales_report.xlsx"
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Excel Report Error:", err);
        res.redirect('/pageNotFound') 
    }
}

const generatePdfReport = async (req, res)=>{
    try {
         const { search, sort, status, dateFilter, startDate, endDate } = req.query;

        // Build query
        let query = buildOrderQuery({
            search: search?.trim() || "",
            statusFilter: status || "",
            dateFilter,
            startDate,
            endDate
        });

        if (search) {
            const users = await User.find({
                fullname: { $regex: search, $options: "i" }
            }).select("_id");
            query.userId.$in = users.map(u => u._id);
        }

        // Sorting
        let sortOption = {};
        switch (sort) {
            case "oldest": sortOption = { createdOn: 1 }; break;
            case "amountHigh": sortOption = { finalAmount: -1 }; break;
            case "amountLow": sortOption = { finalAmount: 1 }; break;
            default: sortOption = { createdOn: -1 };
        }

        const orders = await Order.find(query)
            .populate("userId")
            .populate("items.productId")
            .sort(sortOption)
            .lean();

        if (status) {
            orders.forEach(order => {
                order.items = order.items.filter(item => item.orderStatus === status);
            });
        }

        // Create PDF
        const doc = new PDFDocument({ margin: 10, size: "A4" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=sales_report.pdf");

        doc.pipe(res);

        // Title
        doc.fontSize(18).text("Sales Report", { align: "center" });
        doc.moveDown();

        // Table setup
        const tableTop = 100;
        const rowHeight = 20;
        let yPos = tableTop;

        doc.fontSize(10);
        const headers = ["Date", "Customer", "Product", "Qty", "Price", "Discount", "Coupon", "Total", "Payment", "Status"];
        const columnWidths = [60, 60, 80, 30, 40, 50, 50, 50, 70, 50];

        // Draw table headers
        let x = 30;
        headers.forEach((header, i) => {
            doc.font("Helvetica-Bold").text(header, x, yPos, { width: columnWidths[i], align: "center" });
            x += columnWidths[i];
        });

        yPos += rowHeight;

        // Totals
        let totalQty = 0;
        let totalPrice = 0;
        let totalDiscount = 0;
        let totalCoupon = 0;
        let totalSales = 0;

        // Draw table rows
        orders.forEach((order, orderIndex) => {
            const totalMRP = order.items.reduce((acc, item) => acc + (item.regularPrice * item.quantity), 0);
            const totalDiscountAmt = order.items.reduce((acc, item) => acc + ((item.regularPrice - item.price) * item.quantity), 0);
            const totalSalePrice = totalMRP - totalDiscountAmt;
            const couponDiscountTotal = order.couponDiscount || 0;

            order.items.forEach((item, itemIndex) => {
                const itemDiscount = (item.regularPrice - item.price) * item.quantity;
                let itemCouponShare = 0;
                if (couponDiscountTotal > 0 && totalSalePrice > 0) {
                    itemCouponShare = (item.price * item.quantity / totalSalePrice) * couponDiscountTotal;
                }

                // Alternating row colors
                if ((orderIndex + itemIndex) % 2 === 0) {
                    doc.rect(30, yPos, 550, rowHeight).fill("#F3F3F3").fillColor("black");
                }

                x = 30;
                const rowValues = [
                    new Date(order.createdOn).toLocaleDateString(),
                    order.userId?.fullname || "Guest",
                    item.productId?.productName || "N/A",
                    item.quantity,
                    item.price.toFixed(2),
                    itemDiscount.toFixed(2),
                    itemCouponShare.toFixed(2),
                    item.totalPrice.toFixed(2),
                    order.paymentMethod,
                    item.orderStatus
                ];

                rowValues.forEach((val, i) => {
                    const numericColumns = [3, 4, 5, 6, 7]; // Qty, Price, Discount, Coupon, Total
                    doc.text(val.toString(), x, yPos + 5, { width: columnWidths[i], align: numericColumns.includes(i) ? "right" : "left" });
                    x += columnWidths[i];
                });

                yPos += rowHeight;

                // Add new page if exceeded
                if (yPos > doc.page.height - 50) {
                    doc.addPage();
                    yPos = tableTop;
                }

                totalQty += item.quantity;
                totalPrice += item.price * item.quantity;
                totalDiscount += itemDiscount;
                totalCoupon += itemCouponShare;
                totalSales += item.totalPrice;
            });
        });

        // Totals row
        yPos += 10; // spacing
        doc.font("Helvetica-Bold");
        x = 30;
        const totalValues = ["TOTAL", "", "", totalQty, totalPrice.toFixed(2), totalDiscount.toFixed(2), totalCoupon.toFixed(2), totalSales.toFixed(2), "", ""];
        const numericColumns = [3, 4, 5, 6, 7];

        totalValues.forEach((val, i) => {
            doc.text(val.toString(), x, yPos + 5, { width: columnWidths[i], align: numericColumns.includes(i) ? "right" : "left" });
            x += columnWidths[i];
        });

        // Horizontal line above totals
        doc.moveTo(30, yPos - 2).lineTo(580, yPos - 2).stroke();

        doc.end();

    } catch (error) {
        console.error("PDF Report Error:", err);
        res.redirect("/pageNotFound");
    }
}

function buildOrderQuery({ search, statusFilter, dateFilter, startDate, endDate }) {
    const query = {};

    if (search) {
        query.userId = {
            $in: []
        };
    }

    if (statusFilter) {
        query["items"] = { $elemMatch: { orderStatus: statusFilter } };
    }

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
    const limit = 4
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

    orderData.forEach(order => {
  order.items = order.items.filter(item => item.orderStatus === "Delivered");
})

    

const count = await Order.countDocuments(query)

res.render("admin/salesReport", {
    orderData,
    currentPage: page,
    totalPages: Math.ceil(count / limit),
    search,
    sort,
    dateFilter,
    startDate,
    endDate
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