const userModel = require('../../models/userSchema');
const productModel = require('../../models/productSchema');
const categoryModal = require('../../models/categorySchema');
const offerModal = require('../../models/offerSchema');

const loadShop = async (req, res) => {
    try {

        let user = null
        if (req.user?._id || req.user?.id) {
              const userId = req.user._id || req.user.id;
              user = await userModel.findById(userId);
            }


        const page = parseInt(req.query.page) || 1;
        const limit = 6; 
        const skip = (page - 1) * limit;
        
        const search = req.query.search || '';

        const priceRanges = req.query.price ? 
            (Array.isArray(req.query.price) ? req.query.price : [req.query.price]) : 
            [];
        const categories = req.query.category ? 
            (Array.isArray(req.query.category) ? req.query.category : [req.query.category]) : 
            [];
        const sortOption = req.query.sort || '';
        
        let query = { isBlocked: false };
        

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { writer: { $regex: search, $options: 'i' } }
            ];
        }


        if (priceRanges.length > 0) {
            const priceConditions = [];
            
            priceRanges.forEach(range => {
                if (range === '0-200') {
                    priceConditions.push({ salePrice: { $lt: 200 } });
                } else if (range === '200-500') {
                    priceConditions.push({ salePrice: { $gte: 200, $lte: 500 } });
                } else if (range === '500-1000') {
                    priceConditions.push({ salePrice: { $gte: 500, $lte: 1000 } });
                } else if (range === 'over1000') {
                    priceConditions.push({ salePrice: { $gt: 1000 } });
                }
            });
            
            if (priceConditions.length > 0) {
                if (query.$or) {

                    query.$and = [
                        { $or: query.$or },
                        { $or: priceConditions }
                    ];
                    delete query.$or; 
                } else {

                    query.$or = priceConditions;
                }
            }
        }
        

        let categoryIds = [];
        if (categories.length > 0) {
            const categoryDocs = await categoryModal.find({ name: { $in: categories } }, { _id: 1 });
            categoryIds = categoryDocs.map(cat => cat._id);
            
            if (categoryIds.length > 0) {
                query.category_id = { $in: categoryIds };
            }
        }
        

        let sortOptions = {};
        
        switch (sortOption) {
            case 'price_asc':
                sortOptions = { salePrice: 1 };
                break;
            case 'price_desc':
                sortOptions = { salePrice: -1 };
                break;
            case 'AtoZ':
                sortOptions = { name: 1 };
                break;
            case 'ZtoA':
                sortOptions = { name: -1 };
                break;
            default: 
                sortOptions = { createdAt: -1 };
                break;
        }
        
        const totalProductsCount = await productModel.countDocuments(query);
        
        const totalPages = Math.ceil(totalProductsCount / limit) || 1;
        

        const totalProducts = await productModel.find(query)
            .sort(sortOptions)
            .populate('category_id') 
            .skip(skip)
            .limit(limit);
        

        const currentDate = new Date();
        const activeOffers = await offerModal.find({
            isActive: true,
            endDate: { $gt: currentDate }
        });


        const categoryOffers = {};
        const productOffers = {};
        
        activeOffers.forEach(offer => {
            if (offer.offerType === 'category' && offer.category) {
                categoryOffers[offer.category.toString()] = offer;
            } else if (offer.offerType === 'product' && offer.product) {
                productOffers[offer.product.toString()] = offer;
            }
        });
        
        const products = totalProducts.map(product => {
            let offerPercentage = 0;
            let productId = product._id.toString();
            let categoryId = product.category_id ? product.category_id._id.toString() : null;
            
            if (categoryId && categoryOffers[categoryId]) {
                offerPercentage = categoryOffers[categoryId].discountPercentage;
            } 
            if (productOffers[productId] && productOffers[productId].discountPercentage > offerPercentage) { 
                offerPercentage = productOffers[productId].discountPercentage;
            }
            
            let finalPrice = product.salePrice > 0 ? product.salePrice : product.regularPrice;
            if (offerPercentage > 0) {
                finalPrice = finalPrice * (1 - offerPercentage / 100);
            }
            
            return {
                _id: product._id,
                title: product.name,
                writer: product.writer,
                price: Math.floor(finalPrice),
                regularPrice: product.salePrice > 0 ? Math.floor(product.salePrice) : Math.floor(product.regularPrice),
                offerPercentage: offerPercentage,
                hasOffer: offerPercentage > 0,
                productImages: product.productImages[0],
                isBlocked: product.isBlocked
            };
        });
        
        const filterCategory = await categoryModal.find({},{name:1});

        res.render('User/userShop', {
            user,
            products,
            totalProductsCount,
            currentPage: page,
            totalPages,
            search,
            priceRanges,
            categories,
            sortOption,
            filterCategory
        });
        
    } catch (error) {
        console.log(`Error in loadShop in shopController: ${error}`);
        res.render('500');
    }
};

module.exports = {
    loadShop
};