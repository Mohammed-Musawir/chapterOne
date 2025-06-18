const userModel = require('../../models/userSchema')
const productModal = require('../../models/productSchema');
const categoryModal = require('../../models/categorySchema');
const offerModal = require('../../models/offerSchema');

const loadProductPage = async (req, res) => {
    try {
        const { id } = req.params;
        
        let user = null;
        
        if (req.user?._id || req.user?.id) {
            const userId = req.user._id || req.user.id;
            user = await userModel.findById(userId);
        }
        
        const product = await productModal.findById(id).populate('category_id');
        
        const relatedProducts = await productModal.find({
            category_id: product.category_id._id,
            _id: { $ne: product._id }
        });
        
        // Find product-specific offer
        const productOffer = await offerModal.findOne({
            offerType: 'product',
            product: product._id,
            isActive: true,
            endDate: { $gt: new Date() }
        });
        
        // Find category-specific offer
        const categoryOffer = await offerModal.findOne({
            offerType: 'category',
            category: product.category_id._id,
            isActive: true,
            endDate: { $gt: new Date() }
        });
        
        let discountPercentage = 0;
        
        // Apply the higher discount offer
        if (productOffer && categoryOffer) {
            if (productOffer.discountPercentage >= categoryOffer.discountPercentage) {
                product.offer = {
                    name: productOffer.name,
                    description: productOffer.description,
                    endDate: productOffer.endDate
                };
                discountPercentage = productOffer.discountPercentage;
            } else {
                product.offer = {
                    name: categoryOffer.name,
                    description: categoryOffer.description,
                    endDate: categoryOffer.endDate
                };
                discountPercentage = categoryOffer.discountPercentage;
            }
        } else if (productOffer) {
            product.offer = {
                name: productOffer.name,
                description: productOffer.description,
                endDate: productOffer.endDate
            };
            discountPercentage = productOffer.discountPercentage;
        } else if (categoryOffer) {
            product.offer = {
                name: categoryOffer.name,
                description: categoryOffer.description,
                endDate: categoryOffer.endDate
            };
            discountPercentage = categoryOffer.discountPercentage;
        }
        
        // Calculate final price with offers (without modifying original salePrice)
        product.discount = discountPercentage;
        
        // Use salePrice if available, otherwise use regularPrice as base
        const basePrice = product.salePrice > 0 ? product.salePrice : product.regularPrice;
        
        if (discountPercentage > 0) {
            // Calculate discounted price from the base price
            product.finalPrice = Math.round(basePrice - (basePrice * discountPercentage / 100));
        } else {
            // No discount, final price equals base price
            product.finalPrice = basePrice;
        }
        
        // Ensure salePrice is set for display purposes
        if (product.salePrice === 0) {
            product.salePrice = product.regularPrice;
        }
        
        // Process related products with offers
        const relatedProductsWithOffers = await Promise.all(relatedProducts.map(async (relatedProduct) => {
            const prodOffer = await offerModal.findOne({
                offerType: 'product',
                product: relatedProduct._id,
                isActive: true,
                endDate: { $gt: new Date() }
            });
            
            const catOffer = categoryOffer; // Same category offer as main product
            
            let relatedDiscountPercentage = 0;
            
            // Apply the higher discount offer for related products
            if (prodOffer && catOffer) {
                relatedDiscountPercentage = Math.max(prodOffer.discountPercentage, catOffer.discountPercentage);
                
                if (prodOffer.discountPercentage >= catOffer.discountPercentage) {
                    relatedProduct.offer = {
                        name: prodOffer.name,
                        description: prodOffer.description,
                        endDate: prodOffer.endDate
                    };
                } else {
                    relatedProduct.offer = {
                        name: catOffer.name,
                        description: catOffer.description,
                        endDate: catOffer.endDate
                    };
                }
            } else if (prodOffer) {
                relatedDiscountPercentage = prodOffer.discountPercentage;
                relatedProduct.offer = {
                    name: prodOffer.name,
                    description: prodOffer.description,
                    endDate: prodOffer.endDate
                };
            } else if (catOffer) {
                relatedDiscountPercentage = catOffer.discountPercentage;
                relatedProduct.offer = {
                    name: catOffer.name,
                    description: catOffer.description,
                    endDate: catOffer.endDate
                };
            }
            
            // Calculate final price for related products (without modifying original salePrice)
            relatedProduct.discount = relatedDiscountPercentage;
            
            // Use salePrice if available, otherwise use regularPrice as base
            const relatedBasePrice = relatedProduct.salePrice > 0 ? relatedProduct.salePrice : relatedProduct.regularPrice;
            
            if (relatedDiscountPercentage > 0) {
                // Calculate discounted price from the base price
                relatedProduct.finalPrice = Math.round(relatedBasePrice - (relatedBasePrice * relatedDiscountPercentage / 100));
            } else {
                // No discount, final price equals base price
                relatedProduct.finalPrice = relatedBasePrice;
            }
            
            // Ensure salePrice is set for display purposes
            if (relatedProduct.salePrice === 0) {
                relatedProduct.salePrice = relatedProduct.regularPrice;
            }
            
            return relatedProduct;
        }));
        
        res.render('User/userProductPage', {
            user,
            product,
            relatedProducts: relatedProductsWithOffers
        });
        
    } catch (error) {
        console.log(`Error in Load ProductPage in ProductPageController: ${error}`);
        res.render('500');
    }
};

module.exports = {
    loadProductPage
};