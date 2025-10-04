const User = require('../../model/userSchema')
const Product = require('../../model/productSchema')
const Category = require('../../model/categorySchema')
const Wishlist = require('../../model/wishlistSchema')
const Cart = require('../../model/cartSchema')
const maxProduct = 5

const productDetails = async (req, res)=>{
    try {
        
        const userId = req.session.user
        const userData = await User.findById(userId)
        const productId = req.query.id 
        const product = await Product.findById(productId).populate('category')
        const findCategory = product.category
        const categoryOffer = findCategory ?.categoryOffer || 0
        const productOffer = product.productOffer || 0
        const totalOffer = categoryOffer + productOffer
        const recomentedProduct = await Product.find({category: findCategory}).limit(2)
        const sizeVariant = product.sizeVariant

        res.render('user/productDetails',{
            user: userData,
            product: product,
            quantity: product.totalQuantity,
            totalOffer: totalOffer,
            category: findCategory,
            recoment: recomentedProduct,
            size: sizeVariant
        })
        
    } catch (error) {

        console.error("Error in loading product details page, "+error)
        
    }
}

const addToWishlist = async(req, res)=>{

try {
    const productId = req.query.id;
    const userId = req.session.user;

    const userData = await User.findById(userId)

    if(!userData){
      return res.status(400).json({success: false})
    }
  
    let existingWishlist = await Wishlist.findOne({ userId });


    if (existingWishlist) {

      const existingProduct = existingWishlist.products.some(p => p.productId.toString() === productId);

      // const cart = await Cart.findOne({userId: userId})
      
      // const productInCart = cart?.items?.some(item=> item.productId.toString() === productId)


      if (!existingProduct) {

        

          existingWishlist.products.push({ productId });

          existingWishlist.totalProducts = existingWishlist.products.length

          await existingWishlist.save();

          return res.json({ success: true });
        

      } else {

        return res.json({ success: false, message: "Already in wishlist" });

      }
    } else {

      const newWishlist = new Wishlist({
        userId,
        products: [{ productId }],
        totalProducts: 1
        
      });

      await newWishlist.save();

      res.json({ success: true, message:"Added to wishlist"});

    }
  } catch (error) {

    console.error("Wishlist error:", error);

    res.json({ success: false, message: "Server error" });

  }
}

const loadWishlist = async (req,res)=>{

   try {

    const userId = req.session.user
    const userData = await User.findById(userId)
    const page = parseInt(req.query.page) || 1
    const limit = 8
    const skip = (page - 1) * limit

    
    const wishlistDoc = await Wishlist.findOne({ userId }).populate('products.productId')

    if (!wishlistDoc || wishlistDoc.products.length === 0) {
      return res.render('user/wishlist', {
        user: userData,
        products: [],
        currentPage: 1,
        totalPages: 1,
        totalWishProducts: 0
      })
    }

    const totalProducts = wishlistDoc.products.length
    const totalPages = Math.ceil(totalProducts / limit)

    const paginatedItems = wishlistDoc.products.slice(skip, skip + limit)

    const products = paginatedItems.map(item => item.productId)

    res.render('user/wishlist', {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      totalWishProducts : totalProducts
    })
    
   } catch (error) {

    console.error("Error in loading wishlist: ",error)

    res.redirect('/pageNotFound')
    
   }
}

const removeFromWishlist = async (req, res)=>{
  try {

    const productId = req.query.id

    const userId = req.session.user

    const wishlist = await Wishlist.findOne({userId})

    if(!wishlist){
      return res.redirect('/pageNotFound')
    }

    await Wishlist.findOneAndUpdate({userId:userId},{$pull:{products:{productId:productId}}}, {new:true})

    res.redirect('/wishlist')
    
  } catch (error) {
    
    console.error("Error in remove product from wishlist: ", error)
    res.redirect('/pageNotFound')
  }
}

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const {selectedSize, productId} = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Cannot find product" });
    }

    const product = await Product.findById(productId);

    if (!product || product.isBlocked || product.totalQuantity === 0) {
      return res.status(400).json({ message: "This product is unavailable." });
    }

    const category = await Category.findOne({ _id: product.category });

    if (!category || !category.isListed) {
      return res.status(400).json({ message: "This category is currently unavailable." });
    }

    const price = product.salePrice;

    const regularPrice = product.regularPrice

    let cart = await Cart.findOne({ userId })

    if (!cart) {
      
      cart = new Cart({
        userId,
        items: [{
          productId,
          quantity: 1,
          price,
          size: selectedSize,
          totalPrice: price,
          regularPrice,
          totalRegularPrice: regularPrice
        }]

      });
    } else {
      
      const existingItem = cart.items.find(item =>
        item.productId.toString() === productId &&
        item.size === selectedSize
      )

      if (existingItem) {

        if (existingItem.quantity >= maxProduct) {

          return res.status(400).json({ message: "Reached limit" });

        }

        existingItem.quantity += 1;
        existingItem.totalPrice = existingItem.price * existingItem.quantity
        existingItem.totalRegularPrice = existingItem.regularPrice * existingItem.quantity
        
      } else {
        
        cart.items.push({
          productId,
          quantity: 1,
          price,
          size: selectedSize,
          totalPrice: price,
          regularPrice,
          totalRegularPrice: regularPrice
        })
      }

     cart.totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0)
    cart.totalCartPrice = cart.items.reduce((acc, item) => acc + item.totalPrice, 0);
    cart.totalMRP = cart.items.reduce((acc, item) => acc + item.totalRegularPrice, 0);
    cart.totalDiscount = cart.totalMRP - cart.totalCartPrice
     
    }

    await cart.save();

    await Wishlist.updateOne({userId: userId},
      
      {$pull:{products:{productId:productId}}})

    return res.status(200).json({ message: "Added to cart" });

  } catch (error) {

    console.log("Error in add product to cart: ", error);
    return res.status(500).json({success: false});
  }
};


const loadcart = async (req, res)=>{

  try {

    const userId = req.session.user
    const userData = await User.findById(userId)

  const cart = await Cart.findOne({ userId }).populate('items.productId')

  if (!cart || cart.items.length === 0) {
    return res.render('user/cart', 
      {
        user: userData,
        cartItems: [], 
        totalMRP: 0, 
        totalDiscount: 0, 
        finalAmount: 0 
      })
  }


  cart.totalCartPrice = cart.items.reduce((acc, item)=> acc + item.totalPrice, 0)
  cart.totalMRP = cart.items.reduce((acc, item)=> acc + item.totalRegularPrice, 0)
  cart.totalDiscount = cart.totalMRP - cart.totalCartPrice
  const totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0)

    const cartItems = cart.items.map(item => {
      const product = item.productId

    return {
      productId: product._id,
      productName: product.productName,
      productImage: product.productImage[0],
      price: item.price,
      totalPrice: item.totalPrice,
      quantity: item.quantity,
      size: product.sizeVariant,
      selectedSize: item.size,
      cartItemId: item._id
    }
  })

  await cart.save()

  res.render('user/cart', {
    user: userData,
    cartItems,
    totalMRP: cart.totalMRP,
    totalDiscount: cart.totalDiscount,
    finalAmount: cart.totalCartPrice,
    totalItems: cart.totalQuantity
  })
    
  } catch (error) {

    console.error('Error in loading cart: ',error)

    res.redirect('/pageNotFound')
    
  }
}

const removeProduct = async(req,res)=>{
  try {

    const userId = req.session.user

    const itemId = req.query.id

    await Cart.updateOne(
      { userId },
      { $pull: { items: { _id: itemId } } }
  );

  const cart = await Cart.findOne({userId})

  cart.totalCartPrice = cart.items.reduce((acc, item)=> acc + item.totalPrice,0)

  cart.totalQuantity = cart.items.reduce((acc, item)=> acc + item.quantity,0)

  await cart.save()

  res.redirect('/cart')
    
  } catch (error) {

    console.error("Error in remove product: ",error)

    res.redirect('/pageNotFound')

  }
}


const updateQuantity = async(req, res)=>{
  try {

    const { cartId, type } = req.body;
    const userId = req.session.user

    const cart = await Cart.findOne({ 'items._id': cartId }).populate('items.productId');
    
    if (!cart) {
      
      return res.json({ success: false, message: 'Cart not found' });

    }

    const item = cart.items.id(cartId);
    const product = item.productId;
    const selectedSize = item.size;
    const stockData = product.sizeVariant.find(s => s.size === selectedSize);
    
    if (!stockData){

      return res.json({ success: false, message: 'Size not found in product' });

    }

    const maxStock = stockData.quantity;

  
  if (type === 'increase') {

    if (item.quantity >= maxStock) {

      return res.json({ success: false, message: `Only ${maxStock} in stock for size ${selectedSize}` });

    }

    if(item.quantity >= maxProduct){


      return res.json({success: false, message: "Reached limit"})

    }

    item.quantity += 1

    item.totalPrice = item.price * item.quantity
    item.totalRegularPrice = item.regularPrice * item.quantity

  } else if (type === 'decrease' && item.quantity > 1) {

    item.quantity -= 1

    item.totalPrice = item.price * item.quantity
    item.totalRegularPrice = item.regularPrice * item.quantity
  }

  cart.totalQuantity = cart.items.reduce((acc, item) => acc + item.quantity, 0)

  await cart.save()

  res.json({ success: true, newQty: item.quantity})
    
  } catch (error) {

    console.error("Error in update quantity: ", error)

    res.redirect('/pageNotFound')
    
  }
}


module.exports = {
    productDetails,
    addToWishlist,
    loadWishlist,
    addToCart,
    loadcart,
    removeProduct,
    updateQuantity,
    removeFromWishlist
}