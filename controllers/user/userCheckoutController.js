const addressModel = require('../../models/addressSchema');
const couponmodel = require('../../models/coupenSchema');
const productModel = require('../../models/productSchema');
const cartModel = require('../../models/cartSchema');
const orderModel = require('../../models/orderSchema');
const offerModel = require('../../models/offerSchema');
const walletModel = require('../../models/walletSchema');  
const mongoose = require('mongoose');
const addTransaction = require('../../services/transactionService');
 


const loadCheckOutPage = async (req, res) => {
  try { 
      const userId = req.user._id || req.user.id;
      const addresses = await addressModel.find({userId});
      
      const cart = await cartModel.findOne({userId}).populate('books.product');
      
      let totalItems = 0;
      if (cart && cart.books.length > 0) {
          totalItems = cart.books.reduce((acc, item) => acc + item.quantity, 0);
      }
          
      const currentDate = new Date();
      const activeOffers = await offerModel.find({
          isActive: true,
          endDate: { $gt: currentDate }
      });
          
      const productsWithDiscounts = [];
      let originalSubtotal = 0;
      let subtotal = 0;
      let totalOfferDiscount = 0;
      
      if (cart && cart.books.length > 0) {
          for (const item of cart.books) {
              const product = item.product;
              
              
              const originalPrice = product.salePrice;
              const originalItemTotal = Math.floor(originalPrice * item.quantity);
              originalSubtotal += originalItemTotal;
                              
              const productOffers = activeOffers.filter(offer => 
                  offer.offerType === 'product' &&
                  offer.product &&
                  offer.product.toString() === product._id.toString()
              );
                              
              const categoryOffers = activeOffers.filter(offer => 
                  offer.offerType === 'category' &&
                  offer.category &&
                  offer.category.toString() === product.category_id.toString()
              );
                              
              const allApplicableOffers = [...productOffers, ...categoryOffers];
              
              let bestOffer = null;
              let highestDiscount = 0;
              
              allApplicableOffers.forEach(offer => {
                  const discountAmount = (product.salePrice * offer.discountPercentage) / 100;
                  if (discountAmount > highestDiscount) {
                      highestDiscount = discountAmount;
                      bestOffer = offer;
                  }
              });
                              
              
              const discountedPrice = bestOffer ?
                  originalPrice - (originalPrice * bestOffer.discountPercentage / 100) :
                  originalPrice;
                          
              
              const totalForItem = Math.floor(discountedPrice * item.quantity);
              subtotal += totalForItem;
              
              
              if (bestOffer) {
                  const itemDiscountAmount = Math.floor((originalPrice - discountedPrice) * item.quantity);
                  totalOfferDiscount += itemDiscountAmount;
              }
                              
              productsWithDiscounts.push({
                  product: product,
                  quantity: item.quantity,
                  originalPrice: Math.floor(originalPrice),
                  discountedPrice: Math.floor(discountedPrice),
                  appliedOffer: bestOffer,
                  totalPrice: totalForItem  
              });
          }
      }
      
      const shippingCost = subtotal > 1000 ? 0 : 60;
      const gstAmount = Math.floor((subtotal) * 0.18);
      const totalPrice = subtotal + gstAmount + shippingCost;
      
      
      const TotalPrice = totalPrice;
      const Subtotal = subtotal;
      const TotalOfferDiscount = totalOfferDiscount;
      
      
      const activeCoupons = await couponmodel.find({
          isBlocked: false,
          expireDate: { $gt: currentDate },
          usedBy: { $nin: [userId] }
      });
      
      const appliedCoupon = req.session.appliedCoupon || [];
      
      res.render("User/userCheckoutPage", {
          addresses,
          subtotal: Subtotal,
          shippingCost,
          gstAmount,
          totalPrice: TotalPrice,
          totalOfferDiscount: TotalOfferDiscount,
          activeCoupons,
          appliedCoupon,
          cart,
          productsWithDiscounts
      });
  } catch (error) {
      console.error(error.message);
      res.status(500).send("Something went wrong");
  }
};





const applyCoupen = async (req, res) => {
  try {
      const { couponCode, subtotal, isPostOfferSubtotal } = req.body;
      const userId = req.user._id || req.user.id;

      if (!couponCode) {
          return res.status(400).json({ 
              success: false, 
              message: 'Coupon code is required' 
          });
      }
 
      const coupon = await couponmodel.findOne({
          couponCode: couponCode,
          isBlocked: false
      });

      if (!coupon) {
          return res.status(404).json({ 
              success: false, 
              message: 'Invalid coupon code or coupon not found' 
          });
      }

      const currentDate = new Date();
      if (coupon.expireDate && new Date(coupon.expireDate) < currentDate) {
          return res.status(400).json({ 
              success: false, 
              message: 'This coupon has expired' 
          });
      }

      if (coupon.startDate && new Date(coupon.startDate) > currentDate) {
          return res.status(400).json({ 
              success: false, 
              message: 'This coupon is not active yet' 
          });
      }

      if (subtotal < coupon.minAmount) {
          return res.status(400).json({ 
              success: false, 
              message: `Minimum order amount of ₹${coupon.minAmount} required to use this coupon` 
          });
      }

      if (userId && coupon.usedBy && coupon.usedBy.includes(userId)) {
          return res.status(400).json({ 
              success: false, 
              message: 'You have already used this coupon' 
          });
      }
      
      if (coupon.user && coupon.user.length > 0 && userId && !coupon.user.includes(userId)) {
          return res.status(400).json({ 
              success: false, 
              message: 'This coupon is not available for your account' 
          });
      }

      if (parseFloat(subtotal) < parseFloat(coupon.minAmount)) {
        return res.status(400).json({ 
            success: false, 
            message: `Minimum order amount of ₹${coupon.minAmount} required to use this coupon` 
        });
      }


      const discountAmount = coupon.offerPrice;
      const subtotalForCalculation = parseFloat(subtotal);
      const discountedSubtotal = subtotalForCalculation - discountAmount;
      const shippingCost = discountedSubtotal > 1000 ? 0 : 60;
      const gstAmount = Math.round((subtotalForCalculation + shippingCost) * 0.18);
      const newTotal = discountedSubtotal + gstAmount + shippingCost;
      
      
      req.session.appliedCoupon = {
        id: coupon._id,
        code: coupon.couponCode,
        discount: discountAmount,
        subtotal:subtotal
    };

      return res.status(200).json({
        success: true,
        message: 'Coupon applied successfully',
        coupon: {
            code: coupon.couponCode,
            discount: discountAmount
        },
        updatedTotal: newTotal,
        gstAmount: gstAmount,
        shippingCost: shippingCost
    });
    
      
  } catch (error) {
      console.error('Error applying coupon:', error);
      return res.status(500).json({
          success: false,
          message: 'An error occurred while applying the coupon'
      });
  }
};

const removeCoupon = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;

        if (!req.session.appliedCoupon) {
            return res.status(400).json({
              success: false,
              message: 'No coupon is currently applied'
            });
        }

        const cart = await cartModel.findOne({ userId }).populate('books.product');
    
        if (!cart || !cart.books || cart.books.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        const appliedCoupon = req.session.appliedCoupon;
        const subtotal    = appliedCoupon.subtotal;

          
        const shippingCost = subtotal > 1000 ? 0 : 60;
        const gstAmount = Math.round((subtotal + shippingCost) * 0.18);
        const updatedTotal = subtotal + gstAmount + shippingCost;
          

        
        delete req.session.appliedCoupon;
        
        
        req.session.save();

        return res.status(200).json({
            success: true,
            message: 'Coupon removed successfully',
            updatedTotal: updatedTotal,
            subtotal: subtotal,
            gstAmount: gstAmount,
            shippingCost: shippingCost
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while removing the coupon'
        });
    }
};


const walletBalance = async(req,res) => {
    try {
        
        const userId = req.user._id || req.user.id;

        let wallet = await walletModel.findOne({userId});

        if(!wallet) {
            wallet = new walletModel({
                userId,
                amount: 0
              });
              await wallet.save();
        }

        return res.status(200).json({
            success: true,
            balance: wallet.amount
          });

    } catch (error) {
        console.error('Error fetching wallet balance:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching your wallet balance'
    });
    }
}

const walletPay = async (req, res) => {
    try {
      const userId = req.user._id || req.user.id;
      
      const {
        addressId,
        subtotal,
        gstAmount,
        totalAmount,
        shippingCost,
        products,
        paymentMethod,
        coupon
      } = req.body;
  
      
      if (paymentMethod !== 'wallet') {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment method for wallet payment'
        });
      }
  
      
      if (!subtotal || !totalAmount || !products || !products.length) {
        return res.status(400).json({
          success: false,
          message: 'Missing required order details'
        });
      }
  
      if (!addressId) {
        return res.status(400).json({
          success: false,
          message: 'Shipping address is required'
        });
      }
  
      
      const wallet = await walletModel.findOne({ userId });
      console.log(`hoiiiiiiiii       ${wallet}`)
      if (!wallet) {
        return res.status(400).json({
          success: false,
          message: 'Wallet not found'
        });
      }
  
      if (wallet.amount < totalAmount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
        });
      }
  
      
      const addressDetails = await addressModel.findOne({ 
        _id: addressId, 
        userId: userId 
      });
  
      if (!addressDetails) {
        return res.status(404).json({
          success: false,
          message: 'Address not found'
        });
      }
  
      
      const orderProducts = [];
      
      for (const item of products) {
        
        const productDetails = await mongoose.model('Product').findById(item.productId);
        
        if (!productDetails) {
          return res.status(404).json({
            success: false,
            message: `Product with ID ${item.productId} not found`
          });
        }
        
        
        orderProducts.push({
          product: item.productId,
          productDetails: {
            name: productDetails.name,
            writer: productDetails.writer,
            salePrice: productDetails.salePrice,
            productImages: productDetails.productImages,
            discoundedPrice: item.discountedPrice || productDetails.salePrice
          },
          quantity: item.quantity,
          productOrderStatus: 'pending'
        });
      }
      
      const couponData = coupon ? {
        couponCode: coupon.couponCode,
        discount: coupon.couponDiscount
      } : undefined;

      
      const orderDetails = {
        userId,
        products: orderProducts,
        shippingAddress: {
          userId: userId,
          fullName: addressDetails.fullName,
          alternative_no: addressDetails.alternative_no,
          houseNumber: addressDetails.houseNumber,
          street: addressDetails.street,
          landmark: addressDetails.landmark,
          city: addressDetails.city,
          state: addressDetails.state,
          pincode: addressDetails.pincode,
          addressType: addressDetails.addressType
        },
        subtotal,
        shippingCost: shippingCost || 60, 
        gstAmount,
        totalAmount,
        paymentMethod: 'wallet',
        paymentStatus: 'completed', 
        orderStatus: 'processing',
        
        ...(couponData && { coupon: couponData })
      };
  
      
      
      const newOrder = new orderModel(orderDetails);


      if (coupon && coupon.couponCode) {
  await couponmodel.findOneAndUpdate(
    { couponCode: coupon.couponCode },
    { $addToSet: { usedBy: userId } }
  );
}

      const savedOrder = await newOrder.save();
  
    
      wallet.amount -= totalAmount; 
      await wallet.save();
  
    
      await addTransaction(
        userId,
        'Debit',
        totalAmount,
        'Order Payment' 
      );
  
      return res.status(200).json({
        success: true,
        message: 'Order placed successfully using wallet payment',
        orderId: savedOrder.orderId,
        order: savedOrder
      });
    } catch (error) {
      console.error('Error in walletPay controller:', error);
      return res.status(500).json({
        success: false,
        message: 'Something went wrong while processing wallet payment',
        error: error.message
      });
    }
  }



module.exports = { 
    loadCheckOutPage,
    applyCoupen,
    removeCoupon,
    walletBalance,
    walletPay
}