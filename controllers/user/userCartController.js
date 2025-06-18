const cartModel = require('../../models/cartSchema');
const productModal = require('../../models/productSchema');
const wishlistModel = require('../../models/wishlistSchema'); 
const offerModel = require('../../models/offerSchema'); 


const loadCart = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const cart = await cartModel.findOne({ userId }).populate('books.product');
        const wishlist = await wishlistModel.findOne({ userId });
        
        
        const activeOffers = await offerModel.find({ 
            isActive: true, 
            endDate: { $gt: new Date() } 
        });
        

        const productOffers = new Map();
        const categoryOffers = new Map();
        
        activeOffers.forEach(offer => {
            if (offer.offerType === 'product' && offer.product) {
                productOffers.set(offer.product.toString(), offer);
            } else if (offer.offerType === 'category' && offer.category) {
                categoryOffers.set(offer.category.toString(), offer);
            }
        });

        const cartProductIds = cart?.books.map(item => 
            item.product ? item.product._id.toString() : null
        ).filter(id => id) || [];
        
        const wishlistProductIds = wishlist?.books && Array.isArray(wishlist.books) 
            ? wishlist.books
                .filter(item => item.product) 
                .map(item => typeof item.product === 'object' ? item.product._id.toString() : item.product.toString()) 
            : [];
        
        const excludingProductIds = [...new Set([...cartProductIds, ...wishlistProductIds])];
        
        
        let recommendedBooks = [];
        if (excludingProductIds.length === 0) {
            recommendedBooks = await productModal.find().limit(4);
        } else {
            recommendedBooks = await productModal.find({
                _id: { $nin: excludingProductIds.filter(id => id && id.length === 24) }
            }).limit(4);
        }
    
        
        const applyBestOffer = (product) => {
            if (!product) {
                console.log('Warning: Null product passed to applyBestOffer');
                return null;
            }
            
            
            const productId = product._id.toString();
            const categoryId = product.category_id ? product.category_id.toString() : null;
                    
            
            const productOffer = productOffers.get(productId);
            const categoryOffer = categoryId ? categoryOffers.get(categoryId) : null;

            
            let bestOffer = null;
            let offerSource = null;
        
            
            if (productOffer && categoryOffer) {
                if (productOffer.discountPercentage >= categoryOffer.discountPercentage) {
                    bestOffer = productOffer;
                    offerSource = 'product';
                } else {
                    bestOffer = categoryOffer;
                    offerSource = 'category';
                }
            } else if (productOffer) {
                bestOffer = productOffer;
                offerSource = 'product';
            } else if (categoryOffer) {
                bestOffer = categoryOffer;
                offerSource = 'category';
            } else {
            }
            
            
            if (bestOffer) {
                const originalPrice = product.salePrice;
                const discountAmount = Math.round((originalPrice * bestOffer.discountPercentage) / 100);
                const discountedPrice = originalPrice - discountAmount;
                                
                
                product.hasOffer = true;
                product.offerPercentage = bestOffer.discountPercentage;
                product.offerType = bestOffer.offerType;
                product.offerName = bestOffer.name;
                product.offerSource = offerSource;
                product.discountedAfterOffer = discountedPrice;
                
                return product;
            } else {
                
                product.hasOffer = false;
                
                return product;
            }
        };
        
        recommendedBooks = recommendedBooks.map(product => applyBestOffer(product));
        
        
        let subtotal = 0;
        
        if (cart && cart.books && cart.books.length > 0) {
            
            
            const updatedBooks = [];
            
            for (let i = 0; i < cart.books.length; i++) {
                const item = cart.books[i];
                
                if (!item.product) {
                    continue;
                }
                                
                
                const productWithOffer = applyBestOffer(item.product);
                
                if (!productWithOffer) {
                    continue;
                }
                
                
                
                
                const updatedItem = {
                    product: productWithOffer,
                    quantity: item.quantity
                };

                
                let price = 0;
                if (productWithOffer.hasOffer && productWithOffer.discountedAfterOffer) {
                    price = productWithOffer.discountedAfterOffer;
                } else {
                    price = productWithOffer.salePrice;
                }
                
                subtotal += price * item.quantity;
                
                updatedBooks.push(updatedItem);
            }

            
            if (cart.books) {
                cart.books = updatedBooks;
            }
        }
        
        
        const totalProductPrice = subtotal;
        let shippingCost = totalProductPrice > 1000 ? 0 : 60;
        const gstAmount = Math.round((totalProductPrice) * 0.18);
        

        res.render('User/cartPage', { 
            cart, 
            totalProductPrice, 
            shippingCost, 
            gstAmount, 
            recommendedBooks
        });
    } catch (error) {
        console.error('Error loading cart:', error);
        return res.status(500).render('500');
    }
};

 

const addToCart = async (req, res) => {
    try {
        const { bookId, quantity = 1 } = req.body;
        const userId = req.user._id || req.user.id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Log in to Continue'
            });
        }
        
        if (!bookId) {
            return res.status(400).json({
                success: false,
                message: 'Book ID is required'
            });
        }

        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be greater than zero'
            });
        }

        const product = await productModal.findById(bookId);

        if(!product){
            return res.status(404).json({success:false,message:'Book not Found'});
        }

        if(product.availableQuantity < quantity){
            return res.status(404).json({success:false,message:'Insufficient stock available'});
        }

                
        let cart = await cartModel.findOne({ userId });

        if(!cart) {
            cart = new cartModel({
                userId,
                books: [{ product: bookId, quantity}]
            })
        } else {

            const existingBook = cart.books.find(
                (item) => item.product.toString() === bookId
              );
    
              if (quantity > 10 || (existingBook && existingBook.quantity >= 10)) {
                return res.status(400).json({
                  success: false,
                  message: 'Quantity Limit is reached',
                });
              }

            const bookIndex = cart.books.findIndex(
                (item) => item.product.toString() === bookId
            );

            if(bookIndex > -1) {
                cart.books[bookIndex].quantity += quantity;
            } else {
                cart.books.push({ product: bookId, quantity});
            }
        }

        await cart.save();

        const wishlistResult = await wishlistModel.updateOne(
            {userId},
            {$pull:{books:{product:bookId}}}
        )

        if(!wishlistResult){
            console.log('Didnt removed from wishlist in userCartController in addCart');
            return res.status(400).json({
                success: false,
                message: 'Didnt removed from wishlist'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Item added to cart successfully',
            cart
        });

    } catch (error) {
        console.log('Error adding cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart'
        });
    }
};




const updateCart = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        if (!quantity || quantity < 1 || quantity > 10) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be between 1 and 10'
            });
        }
        
        const userId = req.user._id || req.user.id;
        
        
        let cart = await cartModel.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        
        const bookIndex = cart.books.findIndex(item => 
            item.product.toString() === productId
        );
        if (bookIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in cart'
            });
        }
        
        
        const product = await productModal.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        
        
        cart.books[bookIndex].quantity = quantity;
        await cart.save();
        
        
        const populatedCart = await cartModel.findOne({ userId })
            .populate({
                path: 'books.product',
                model: 'Product'
            });
        
        
        let totalProductPrice = 0;
        const books = [];

        
        for (const item of populatedCart.books) {
            const product = item.product;
            if (!product) continue;
            
            
            let productPrice = Math.floor(product.salePrice);
            let hasOffer = false;
            let offerPercentage = 0;
            let offerSource = null;
            let discountedAfterOffer = null;

            
            const productOffer = await offerModel.findOne({
                offerType: 'product',
                product: product._id,
                isActive: true,
                endDate: { $gte: new Date() }
            });

            
            const categoryOffer = await offerModel.findOne({
                offerType: 'category',
                category: product.category_id,
                isActive: true,
                endDate: { $gte: new Date() }
            });

            
            if (productOffer || categoryOffer) {
                hasOffer = true;
                
                if (productOffer && (!categoryOffer || productOffer.discountPercentage >= categoryOffer.discountPercentage)) {
                    offerPercentage = productOffer.discountPercentage;
                    offerSource = 'product';
                } else {
                    offerPercentage = categoryOffer.discountPercentage;
                    offerSource = 'category';
                }
                
                const discountAmount = (productPrice * offerPercentage) / 100;
                
                discountedAfterOffer = Math.floor(productPrice - discountAmount);
                
                
                totalProductPrice += discountedAfterOffer * item.quantity;
            } else {
                
                totalProductPrice += productPrice * item.quantity;
            }

            
            books.push({
                ...item.toObject(),
                product: {
                    ...product.toObject(),
                    hasOffer,
                    offerPercentage,
                    offerSource,
                    discountedAfterOffer
                }
            });
        }

        const cartData = {
            ...populatedCart.toObject(),
            books,
            totalProductPrice
        };
        
        
        const gstAmount = cartData.totalProductPrice * 0.18;
        const shippingCost = cartData.totalProductPrice >= 1000 ? 0 : 60;
        const totalAmount = cartData.totalProductPrice + gstAmount + shippingCost;
        
        
        
        let itemPrice = Math.floor(product.salePrice);
        let hasOffer = false;
        let offerPercentage = 0;
        let offerSource = null;
        let discountedAfterOffer = null;
        
        
        const productOffer = await offerModel.findOne({
            offerType: 'product',
            product: productId,
            isActive: true,
            endDate: { $gte: new Date() }
        });
        
        
        const categoryOffer = await offerModel.findOne({
            offerType: 'category',
            category: product.category_id,
            isActive: true,
            endDate: { $gte: new Date() }
        });
        
        
        if (productOffer || categoryOffer) {
            hasOffer = true;
            
            if (productOffer && (!categoryOffer || productOffer.discountPercentage >= categoryOffer.discountPercentage)) {
                offerPercentage = productOffer.discountPercentage;
                offerSource = 'product';
            } else {
                offerPercentage = categoryOffer.discountPercentage;
                offerSource = 'category';
            }
            
            const discountAmount = (itemPrice * offerPercentage) / 100;
            
            discountedAfterOffer = Math.floor(itemPrice - discountAmount);
            itemPrice = discountedAfterOffer;
        }
        
        
        
        return res.status(200).json({
            success: true,
            message: 'Cart updated successfully',
            cart: {
                ...cartData,
                totalProductPrice, 
                gstAmount: Math.round(gstAmount),
                shippingCost: Math.round(shippingCost),
                totalAmount: Math.round(totalAmount)
            },
            itemPrice, 
            hasOffer,
            offerPercentage,
            offerSource
        });
    } catch (error) {
        console.error('Error updating cart:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update cart',
            error: error.message
        });
    }
};


const removeItemFromCart = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { bookId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "User Didnt exists"
            });
        }
        
        if (!bookId) {
            return res.status(400).json({
                success: false,
                message: "Book ID is required"
            });
        }
                
        
        const updatedCart = await cartModel.findOneAndUpdate(
            { userId },
            { $pull: { books: { product: bookId } } },
            { new: true }
        ).populate({
            path: 'books.product',
            model: 'Product'
        });
        
        if (!updatedCart) {
            return res.status(404).json({
                success: false,
                message: "Cart not found or item not in cart"
            });
        }
        
        
        let totalProductPrice = 0;
        let offerModified = false;
        
        
        for (const item of updatedCart.books) {
            const product = item.product;
            const quantity = item.quantity;
            
            if (product) {
                
                let hasOffer = false;
                let discountedPrice = product.salePrice;
                
                
                
                const productOffer = await offerModel.findOne({
                    offerType: 'product',
                    product: product._id,
                    isActive: true,
                    endDate: { $gt: new Date() }
                });
                
                const categoryOffer = await offerModel.findOne({
                    offerType: 'category',
                    category: product.category_id,
                    isActive: true,
                    endDate: { $gt: new Date() }
                });
                
                
                if (productOffer || categoryOffer) {
                    hasOffer = true;
                    offerModified = true;
                    
                    const productDiscount = productOffer ? (product.salePrice * (productOffer.discountPercentage / 100)) : 0;
                    const categoryDiscount = categoryOffer ? (product.salePrice * (categoryOffer.discountPercentage / 100)) : 0;
                    
                    
                    const discount = Math.max(productDiscount, categoryDiscount);
                    discountedPrice = product.salePrice - discount;
                    
                    
                    product.hasOffer = true;
                    product.discountedAfterOffer = discountedPrice;
                    product.offerPercentage = productOffer && productDiscount >= categoryDiscount 
                        ? productOffer.discountPercentage 
                        : categoryOffer.discountPercentage;
                    product.offerSource = productOffer && productDiscount >= categoryDiscount 
                        ? 'product' 
                        : 'category';
                }
                
                
                totalProductPrice += (hasOffer ? discountedPrice : product.salePrice) * quantity;
            }
        }
        
        
        const shippingCost = totalProductPrice >= 1000 ? 0 : 60;
        const gstAmount = totalProductPrice * 0.18;
        const totalAmount = totalProductPrice + shippingCost + gstAmount;
        
        
        res.status(200).json({
            success: true,
            message: "Item removed from cart successfully",
            cart: {
                ...updatedCart.toObject(),
                totalProductPrice,
                shippingCost,
                gstAmount,
                totalAmount,
                offerModified
            }
        });
    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({
            success: false,
            message: "Failed to remove item from cart"
        });
    }
};



const checkStock = async (req,res) => {
    try {
        
        const { bookId, quantity } = req.body;
        if (!bookId || quantity === undefined || isNaN(quantity) || quantity < 1) {
            console.log(`bookid or quantity not found `);
            return res.status(400).json({
                success: false,
                message: 'Book ID and quantity are required'
            });
        }
        const product = await productModal.findById(bookId);
        if (!product) {
            console.log(`product is not there in checkstatus is userCartController`)
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        } 
        let requestedQuantity = quantity;
        let stock = product.availableQuantity;
        if(stock < requestedQuantity){
            console.log('error here')
            return res.status(400).json({
                success:false,
                message:`Insuffient stock`,
                available: false
            })
        }
        return res.status(200).json({
            success:true,
            message: 'Stock is available',
            available: true 
        })

    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({
            success: false,
            message: "Failed to check the stock",
            available: false
        });
    }
}


module.exports = {
    loadCart,
    addToCart,
    updateCart,
    removeItemFromCart,
    checkStock
}