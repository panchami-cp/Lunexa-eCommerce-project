const Category = require('../../model/categorySchema')
const Product = require('../../model/productSchema')
const pluralize = require('pluralize')
const fuzzy = require('fuzzy')


const categoryInfo = async (req, res)=>{

    try {
        
        let search = req.query.search || ""
        
        let page = parseInt(req.query.page) || 1
        
        const limit = 4
        let skip = (page - 1)*limit

        const categoryData = await Category.find({categoryName:{$regex:".*"+search+".*", $options:"i"}})
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit)

        const totalCategories = await Category.countDocuments()
        const totalPages = Math.ceil(totalCategories/limit)

        res.render('admin/category',{
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories,
            search: search

        })

    } catch (error) {
        console.error("Error in loading category: "+error)
    }
}

const addCategory = async (req,res)=>{
    try {

        const {name, description} = req.body

      // Normalize input name
        const input = pluralize.singular(name.trim().toLowerCase())

        // Get existing category names
        const allCategories = await Category.find()
        const existingNames = allCategories.map(cat =>
            pluralize.singular(cat.categoryName.trim().toLowerCase())
        )

        // 1. Exact match
        if (existingNames.includes(input)) {
            return res.status(400).json({ error: "Category already exists." })
        }

        // 2. Partial match (like 'sports' vs 'sports wear')
        const partialMatch = existingNames.find(existing =>
            existing.includes(input) || input.includes(existing)
        )

        if (partialMatch) {
            return res.status(400).json({error: "Similar category exists"})
        }

        // 3. Fuzzy match (for typos like "drass" vs "dress")
        const fuzzyResults = fuzzy.filter(input, existingNames);
        if (fuzzyResults.length > 0 && fuzzyResults[0].score > 80) {
            return res.status(400).json({error: `Category name is too similar to '${fuzzyResults[0].string}'.`});
        }

        const newCategory = new Category({
            categoryName: name.trim(),
            description: description?.trim()
        })

        await newCategory.save()

        return res.json({message:"Category added successfully"})

        
    } catch (error) {

        return res.status(500).json({error:"Internal server error"})

    }
}



const loadEditCategory = async (req, res)=>{
    try {

        const id = req.query.id

        const category = await Category.findById({_id: id})

        res.render('admin/editCategory',{category:category})

        
    } catch (error) {

        console.error("Error loading edit category, "+ error)
        
    }
}

const editCategory = async (req, res)=>{
    try {
        const id = req.params.id;
        const { categoryName, description } = req.body;

        const trimmedName = categoryName.trim();
        const trimmedDesc = description.trim();

        const input = pluralize.singular(trimmedName.toLowerCase());

        const allCategories = await Category.find({ _id: { $ne: id } });
        const existingNames = allCategories.map(cat =>
            pluralize.singular(cat.categoryName.trim().toLowerCase())
        );

        if (existingNames.includes(input)) {
            return res.status(400).json({ error: "Category already exists." });
        }

        const partialMatch = existingNames.find(existing =>
            existing.includes(input) || input.includes(existing)
        );

        if (partialMatch) {
            return res.status(400).json({ error: "Similar category exists." });
        }

        const fuzzyResults = fuzzy.filter(input, existingNames);
        if (fuzzyResults.length > 0 && fuzzyResults[0].score > 80) {
            return res.status(400).json({
                error: `Category name is too similar to '${fuzzyResults[0].string}'.`
            });
        }


        const updateCategory = await Category.findByIdAndUpdate(
            id,
            { categoryName: trimmedName, description: trimmedDesc },
            { new: true }
        );

        if (updateCategory) {
            return res.status(200).json({ success: true });
        } else {
            return res.status(404).json({ error: "Category not found." });
        }

    } catch (error) {
        console.error("Error in update category: ", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

const unlistCAtegory = async(req,res)=>{
    try {

        const id = req.query.id

        await Category.updateOne({_id: id},{$set:{isListed:false}})

        res.redirect('/admin/category')
        
    } catch (error) {

        console.error("Error in unlist category, "+error)
        
    }
}

const listCategory = async (req, res)=>{

    try {

        const id = req.query.id

        await Category.updateOne({_id: id},{$set:{isListed:true}})

        res.redirect('/admin/category')
        
    } catch (error) {

        console.error('Error in list category, '+error)
        
    }
}

const addCategoryOffer = async (req, res)=>{
    try {

         const {offerValue, categoryId } = req.body

        const offer = Number(offerValue)

        const findCategory = await Category.findById(categoryId)

        if(!findCategory){
            return res.json({success: false, message:"Cannot find category"})
        }

        await Category.updateOne({_id: categoryId},{$set:{offer:offer}})

        const products = await Product.find({category: categoryId})

        for(let product of products){

            const bestOffer = Math.max(offer||0, product.offer||0)

            product.salePrice = Math.ceil(product.regularPrice * (100 - bestOffer) / 100)

            await product.save()
        }

        res.json({success: true})
        
    } catch (error) {

        console.error("Error in adding offer: ",error)

        res.json({success:false, redirectUrl:'/pageNotFound'})
        
    }
}

const removeCategoryOffer = async (req, res)=>{
    try {

        const categoryId = req.query.id

        const category = await Category.findById(categoryId)

        if(!category){
            return res.redirect('/pageNotFound')
        }

        await Category.findByIdAndUpdate(categoryId, {$set:{offer: 0}})

        const products = await Product.find({category: categoryId})

        for(let product of products){
            if(product.offer || product.offer > 0){
                product.salePrice = Math.ceil(product.regularPrice * (100 - product.offer) / 100)
            }else{
                product.salePrice = product.regularPrice
            }

            await product.save()
        }

        res.redirect('/admin/category')
        
    } catch (error) {

        console.error("Error in remove category offer: ",error )
        res.redirect('/pageNotFound')
        
    }
}


module.exports = {
    categoryInfo, 
    addCategory,
    loadEditCategory,
    editCategory,
    unlistCAtegory,
    listCategory,
    addCategoryOffer,
    removeCategoryOffer
}