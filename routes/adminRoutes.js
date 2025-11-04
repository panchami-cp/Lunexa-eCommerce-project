const express = require('express')
const router = express.Router()
const adminController = require('../controller/admin/adminController')
const {userAuth, adminAuth} = require('../middlewares/auth')
const customerController = require('../controller/admin/customrController')
const categoryController = require('../controller/admin/categoryController')
const productController = require('../controller/admin/productController')
const orderController = require('../controller/admin/orderController')
const couponController = require('../controller/admin/couponController')
const uploads = require('../middlewares/uploads')
const { route } = require('./userRoutes')


//admin controller
router.get('/login',adminController.loadLogin)
router.post('/login', adminController.login)
router.get('/',adminAuth,adminController.renderDashboard)
router.get('/dashboardData',adminAuth, adminController.dashboardData)
router.get('/logout', adminAuth, adminController.logout)


//customer controller
router.get('/users', adminAuth, customerController.customerInfo)
router.get('/block_user', adminAuth, customerController.blockUser)
router.get('/unblock_user', adminAuth, customerController.unblockUser)


//category controller
router.get('/category',adminAuth, categoryController.categoryInfo)
router.post('/add_category', adminAuth, categoryController.addCategory)
router.get('/edit_category', adminAuth, categoryController.loadEditCategory)
router.post('/edit_category/:id', adminAuth, categoryController.editCategory)
router.get('/unlist_category',adminAuth, categoryController.unlistCAtegory)
router.get('/list_category', adminAuth, categoryController.listCategory)
router.post('/add_category_offer', adminAuth, categoryController.addCategoryOffer)
router.get('/remove_category_offer', adminAuth, categoryController.removeCategoryOffer)

//product controller
router.get('/products', adminAuth, productController.allProducts)
router.get('/add_product',adminAuth, productController.loadAddProduct)
router.post('/add_product',adminAuth,uploads.array("images", 4),productController.addProduct)
router.get('/edit_product',adminAuth, productController.loadEditProduct)
router.post('/edit_product/:id', adminAuth, uploads.array("images", 4), productController.editProduct)
router.post('/delete_image',adminAuth, productController.deleteSingleImage)
router.get('/block_product', adminAuth, productController.blockProduct)
router.get('/unblock_product', adminAuth, productController.unblockProduct)
router.post('/add_offer', adminAuth, productController.addOffer)
router.get('/remove_offer', adminAuth, productController.removeOffer)


//order controller
router.get('/orders', adminAuth, orderController.listOrders)
router.get('/orders/view_order', adminAuth, orderController.viewOrder)
router.post('/orders/view_order', adminAuth, orderController.changeStatus)
router.post('/return/approve', adminAuth, orderController.approveReturn)
router.post('/return/reject', adminAuth, orderController.rejectReturn)
router.get('/return/refund', adminAuth, orderController.refundPage)
router.post('/return/refund', adminAuth, orderController.refund)
router.get('/approve_all', adminAuth, orderController.approveAllReturn)
router.get('/sales_report/pdf',adminAuth, orderController.generatePdfReport)
router.get('/sales_report/excel', adminAuth, orderController.generateExcelReport)
router.get('/sales_report', adminAuth, orderController.loadSalesReport)

//coupon controller
router.get('/coupon', adminAuth, couponController.loadCoupon)
router.post('/add_coupon', adminAuth, couponController.addCoupon)
router.get('/delete_coupon', adminAuth, couponController.deleteCoupon)

module.exports = router