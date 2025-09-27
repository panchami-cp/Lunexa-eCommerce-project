const Category = require('../../model/categorySchema')
const Product = require('../../model/productSchema')
const fs = require('fs')
const path = require('path')
const User = require('../../model/userSchema')
const sharp = require('sharp')




const allProducts = async (req, res)=>{
    try {
        
        const search = req.query.search || ""
        const searchTerm = String(search || "").trim()
        let page = parseInt(req.query.page) || 1
        const limit = 4
        let skip = (page-1)*limit

        const categories = await Category.find({
            categoryName: { $regex: new RegExp(".*" + searchTerm + ".*", "i") }
            }).select('_id')

        const categoryIds = categories.map(cat => cat._id)

        const productData = await Product.find({

            $or:[
                {productName:{$regex:new RegExp(".*"+searchTerm+".*","i")}},
                { category: { $in: categoryIds } }
            ]
        }).populate('category')
        
        
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit)
        .populate('category')
        .exec()

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                { category: { $in: categoryIds } }
            ]
        }).countDocuments()
        
        const category = await Category.find({isListed:true})

        if(category){
            res.render('admin/products',{
                data:productData,
                currentPage: page,
                totalPages: Math.ceil(count/limit),
                cat: category,
                search:  search
            })
        }else{
            res.send('page not found')
        }

    } catch (error) {
        console.error("Error in loading products: "+error)
    }

}

const loadAddProduct = async(req,res)=>{
    try {

        const category = await Category.find({isListed:true})

        const sizeOptions = Product.schema.path('sizeVariant').schema.path('size').enumValues

        res.render('admin/addProduct',{message: null,
            cat:category,
            size: sizeOptions,
        })
        
    } catch (error) {
        console.error("Error in load add products")
    }
}

const addProduct = async (req, res)=>{

    try {

        const category = await Category.find({isListed: true})

        const sizeOptions = Product.schema.path('sizeVariant').schema.path('size').enumValues
        
        const sizeVariant = []

        let totalQuantity = 0

        const product = req.body
       
        let sizes = req.body.sizes

        if (!Array.isArray(sizes)) {

            sizes = [sizes]; 

        }

       sizes.forEach(size => {
        const quantity = parseInt(req.body[`quantity_${size}`])
        
        if (!isNaN(quantity)) {
            sizeVariant.push({ size, quantity });
            totalQuantity += quantity;
        }
        })

        let productStatus

        if(totalQuantity === 0){
            productStatus = 'Out of stock'
        }else if(totalQuantity > 0){
            productStatus = 'In Stock'
        }

        const productExists = await Product.findOne({
            productName:product.productName
        })

        if(!productExists){
            const images = []
            if(req.files && req.files.length>0){
                for(let i=0;i<req.files.length; i++){
                    const originalImagePath = req.files[i].path
                    
                    const resizedImagePath = path.join('public','uploads','re-product-image',req.files[i].filename)
                    
                    await sharp(originalImagePath).resize({width:440, height:440}).toFile(resizedImagePath)

                    images.push(req.files[i].filename)
                }
            }

            const category = await Category.findOne({categoryName:product.category})

            if(!category){
                return res.render('admin/addProduct',{error:"Invalid category name"})
            }

            const catOffer = category.offer
            const price = product.regularPrice
            let salePrice
            
            if(catOffer && catOffer > 0){

                salePrice = Math.ceil(price*(100-catOffer)/100)

            }else{
                salePrice = price
            }

            const newProduct = new Product({
                productName: product.productName,
                description: product.description,
                category: category._id,
                regularPrice: product.regularPrice,
                salePrice: salePrice,
                createdAt: new Date(),
                totalQuantity: totalQuantity,
                color: product.color,
                productImage: images,
                status: productStatus,
                sizeVariant
            })

            await newProduct.save()

            return res.redirect('/admin/products')

        }else{

            return res.render('admin/addProduct',{error:"Product already exists, please try with another name", cat: category, size: sizeOptions})

        }



    } catch (error) {
        
        console.error("Error saving product", error)
        

    }
}

const loadEditProduct = async (req, res)=>{

    try {

        const id = req.query.id

        const product = await Product.findOne({_id: id})

        const category = await Category.find()

       const sizeOptions =  Product.schema.path('sizeVariant').schema.path('size').enumValues

        res.render('admin/editProduct',{
            product: product,
            cat: category,
            size: sizeOptions
        })
        
    } catch (error) {

        console.error("Error in load edit product, "+error)
        
    }

}

const editProduct = async (req, res)=>{
    try {

        const id = req.params.id
        const product = await Product.findOne({_id:id}).populate('category')

        const data = req.body

        let sizes = data.sizes

        if (!Array.isArray(sizes)) {
            sizes = sizes ? [sizes] : [];
        }

        const sizeVariant = [];
        let totalQuantity = 0;

        sizes.forEach(size => {
            const quantity = parseInt(data[`quantity_${size}`]);
            if (!isNaN(quantity) && quantity >= 0) {
                sizeVariant.push({ size, quantity });
                totalQuantity += quantity;
            }
        });

        const existingProduct = await Product.findOne({
            productName:data.productName,
            _id: {$ne: id}
        })

        if(existingProduct){
            return res.status(400).json({error:"Product with this name already exists, Please try with another name"})

        }

         const images = []
            if(req.files && req.files.length>0){
                for(let i=0;i<req.files.length; i++){
                    const originalImagePath = req.files[i].path
                    
                    const resizedImagePath = path.join('public','uploads','re-product-image',req.files[i].filename)
                    
                    await sharp(originalImagePath).resize({width:440, height:440}).toFile(resizedImagePath)

                    images.push(req.files[i].filename)
                }
            }

            let salePrice = data.regularPrice
            const catOffer = product.category.offer

            if (product.offer >= catOffer) {
                salePrice = Math.ceil(data.regularPrice * (100 - product.offer) / 100)
            }else{
                salePrice = Math.ceil(data.regularPrice * (100 - catOffer) / 100)
            }

        const updateFields = {
            productName: data.productName,
            description: data.description,
            category: product.category,
            regularPrice: data.regularPrice,
            salePrice: salePrice,
            color: data.color,
            sizeVariant: sizeVariant,
            status: totalQuantity === 0 ? 'Out of stock' : 'In Stock',
            totalQuantity

        }

        if(req.files.length>0){
            updateFields.$push= {productImage:{$each:images}}

        }else {
    
            updateFields.productImage = product.productImage;
        }

        await Product.findByIdAndUpdate(id,updateFields, {new: true})
        res.redirect('/admin/products')




        
    } catch (error) {

        console.error("Error in edit product, "+error)
        
    }
}


const deleteSingleImage = async (req, res)=>{
    try {

        const {imageNameToServer, productIdToServer} = req.body

        const product = await Product.findByIdAndUpdate(productIdToServer, {$pull:{productImage: imageNameToServer}})

        const imagePath = path.join('public', 'uploads', 're-product-image', imageNameToServer)

        if(fs.existsSync(imagePath)){
            fs.unlinkSync(imagePath)
            
            console.log(`Image ${imageNameToServer} deleted succesfully`)

        }else{
            
            console.log(`Image ${imageNameToServer} not found`)

        }

        res.send({status:true})



        
    } catch (error) {

        console.error("Error in delete image, "+error)
        
    }
}

const blockProduct = async (req, res)=>{
    try {

        const id = req.query.id

        await Product.findByIdAndUpdate(id,{$set:{isBlocked: true}})

        res. redirect('/admin/products')
        
    } catch (error) {

        console.error("Error in block product, "+error)
        
    }
}

const unblockProduct = async (req, res)=>{
    try {

        const id = req.query.id

        await Product.findByIdAndUpdate(id,{$set:{isBlocked: false}})

        res. redirect('/admin/products')
        
    } catch (error) {

        console.error("Error in unblock product, "+error)
        
    }
}

const addOffer = async(req,res)=>{
    try {

        const {offerValue, productId} = req.body

        const offer = Number(offerValue)

        const findProduct = await Product.findById(productId).populate('category')

        if(!findProduct){
            return res.json({success: false, message:"Cannot find product"})
        }else{

            const price = findProduct.regularPrice
            const catOffer = findProduct.category.offer

            let salePrice 
            
            if(offer >= catOffer){
                salePrice = Math.ceil(price * (100 - offer) / 100)
            }else{
                salePrice = Math.ceil(price * (100 - catOffer) / 100)
            }
            
            

            await Product.updateOne({_id: productId},{$set:{salePrice: salePrice,offer:offer}})

            res.json({success: true})
        }


        
    } catch (error) {

        console.error("Error in adding offer: ",error)

        res.json({success:false, redirectUrl:'/pageNotFound'})
        
    }
}

const removeOffer = async (req, res)=>{
    try {

        const productId = req.query.id

        const product = await Product.findById(productId).populate('category')

        if(!product){
            return res.redirect('/pageNotFound')
        }
        const catOffer = product.category.offer
        let salePrice

        if(catOffer && catOffer > 0){
            salePrice = Math.ceil(product.regularPrice * (100 - catOffer) / 100)
        }else{
            salePrice = product.regularPrice
        }

        await Product.findByIdAndUpdate(productId,{$set:{salePrice: salePrice, offer: 0}},{new: true})

        res.redirect('/admin/products')
        
    } catch (error) {

        console.error("Error in remove offer: ", error)
        res.redirect('/pageNotFound')
        
    }
}



module.exports = {
    allProducts,
    loadAddProduct,
    addProduct,
    loadEditProduct,
    editProduct,
    deleteSingleImage,
    blockProduct,
    unblockProduct,
    addOffer,
    removeOffer
}
