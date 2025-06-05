const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Coupen = require('../../models/coupenSchema');
const Offer = require('../../models/offerSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema'); 
const razorpayService = require('../../services/razorpayService');

const razorpayController = {
  createRazorpayOrder: async (req, res) => {
    try {
      const { amount, orderDetails } = req.body;
      const userId = req.user._id || req.user.id; 
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid amount' });
      }
      
      const cart = await Cart.findOne({ userId }).populate('books.product'); 
      if (!cart || cart.books.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty' });
      }
      
      for (const item of cart.books) {
        const product = item.product;
        if (!product) {
          return res.status(400).json({ success: false, message: 'One or more products in your cart are unavailable' });
        }
        
        if (product.isBlocked) {
          return res.status(400).json({ success: false, message: `${product.name} is currently unavailable` });
        }
        
        if (product.availableQuantity < item.quantity) {
          return res.status(400).json({ 
            success: false, 
            message: `Only ${product.availableQuantity} units of ${product.name} are available` 
          });
        }
      }
      
      const receiptId = `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
        req.session.pendingOrder =  orderDetails;
       

      const result = await razorpayService.createOrder(
        amount,
        'INR',
        receiptId,
        { orderDetails } 
      );
      
      if (!result.success) {
        return res.status(400).json({ success: false, message: result.message });
      }
      
      return res.status(200).json({ success: true, order: result.order });
    } catch (error) {
      console.error('Create razorpay order error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },
  
  verifyRazorpayPayment: async (req, res) => {
    try {
      const { paymentId, orderId, signature, orderDetails } = req.body;
  
      const userId = req.user._id || req.user.id;
      
      console.log(orderId)
      if (!paymentId || !orderId || !signature || !orderDetails) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required payment information' 
        });
      }
      
      const isValidSignature = razorpayService.verifyPaymentSignature(orderId, paymentId, signature);
      
      if (!isValidSignature) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid payment signature. Payment verification failed.' 
        });
      }
      
      const address = await Address.findById(orderDetails.addressId);
      if (!address) {
        return res.status(404).json({ 
          success: false, 
          message: 'Shipping address not found' 
        });
      }
      
      const cart = await Cart.findOne({ userId }).populate('books.product');
      if (!cart || cart.books.length === 0) {
        return res.status(400).json({ success: false, message: 'Your cart is empty' });
      }
  
      const mappedProducts = await Promise.all(cart.books.map(async (item) => {
        const product = item.product;
        
        
        const productOffer = await Offer.findOne({
          offerType: 'product',
          product: product._id,
          isActive: true,
          endDate: { $gt: new Date() }
        }).sort({ discountPercentage: -1 }); 
        
        
        const categoryOffer = await Offer.findOne({
          offerType: 'category',
          category: product.category,
          isActive: true,
          endDate: { $gt: new Date() }
        }).sort({ discountPercentage: -1 }); 
        

        
        
        let discountPercentage = 0;
        let appliedOffer = null;
        
        if (productOffer && categoryOffer) {
          
          if (productOffer.discountPercentage >= categoryOffer.discountPercentage) {
            discountPercentage = productOffer.discountPercentage;
            appliedOffer = productOffer;
          } else {
            discountPercentage = categoryOffer.discountPercentage;
            appliedOffer = categoryOffer;
          }
        } else if (productOffer) {
          discountPercentage = productOffer.discountPercentage;
          appliedOffer = productOffer;
        } else if (categoryOffer) {
          discountPercentage = categoryOffer.discountPercentage;
          appliedOffer = categoryOffer;
        }
        
        
        const salePrice = product.salePrice 
        
        
        let discountedPrice = null;
        if (discountPercentage > 0) {
          const discountAmount = (salePrice * discountPercentage) / 100;
          discountedPrice = Number((salePrice - discountAmount).toFixed(2));
        }
        
        
        
        const orderProduct = orderDetails.products.find(p => p.productId.toString() === product._id.toString());
        

                       
        return {
          product: product._id,
          productDetails: {
            name: product.name,
            writer: product.writer || 'Unknown',
            salePrice: salePrice,
            productImages: product.productImages || [],
            discountedPrice: orderProduct.discountedPrice || null,
            appliedOffer: appliedOffer ? {
              offerId: appliedOffer._id,
              offerType: appliedOffer.offerType,
              discountPercentage: appliedOffer.discountPercentage
            } : null
          },
          quantity: item.quantity,
          productOrderStatus: 'pending'
        };
      }));
      
      
      const newOrder = new Order({
        userId: userId,
        products: mappedProducts,
        shippingAddress: {
          userId: userId,
          fullName: address.fullName,
          alternative_no: address.alternative_no,
          houseNumber: address.houseNumber,
          street: address.street,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          addressType: address.addressType
        },
        subtotal: orderDetails.subtotal,
        gstAmount: orderDetails.gstAmount,
        shippingCost: orderDetails.shippingCost,
        totalAmount: orderDetails.totalAmount,
        paymentMethod: 'razorPay',
        paymentStatus: 'completed',
        orderStatus: 'pending',
        razorpayPaymentId: paymentId,
        razorpayOrderId: orderId,
        razorpaySignature: signature
      });
      
      
      if (orderDetails.coupon && orderDetails.coupon.couponCode) {
        newOrder.coupon = {
          couponCode: orderDetails.coupon.couponCode,
          discount: orderDetails.coupon.couponDiscount
        };
         await Coupen.findOneAndUpdate(
        { couponCode: orderDetails.coupon.couponCode },
        { $addToSet: { usedBy: userId } }
      );
      }
      
      
      const savedOrder = await newOrder.save();
      
           req.session.pendingOrder = null;

      
      for (const item of cart.books) {
        await Product.findByIdAndUpdate(
          item.product._id, 
          { $inc: { availableQuantity: -item.quantity } }
        );
      }
      
     
      await Cart.findOneAndUpdate(
        { userId },
        { $set: { books: [] } }
      );
      
      return res.status(400).json({
        success: false,
        message: 'Payment verified and order created successfully',
        orderId: savedOrder.orderId 
      });
    } catch (error) {
      console.error('Verify payment error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Internal server error during payment verification' 
      });
    }
  },

  
  userPaymentError: async (req, res) => {
    try {
      const errorCode = req.query.error_code || '';
      const errorDescription = req.query.error_description || 'Payment was not completed';
      const orderId = req.query.order_id || '';
      const amount = req.query.amount || '';
      
      const userId = req.user._id || req.user.id;
      
      let cart = null;
      if (userId) {
        cart = await Cart.findOne({ userId }).populate('books.product');
      }
      
      res.render('User/razorpayPaymentFailed', {
        errorCode,
        errorDescription,
        orderId,
        amount,
        cart: cart || { books: [] }
      });
    } catch (error) {
      console.error('Payment failed page error:', error);
      res.render('User/razorpayPaymentFailed', {
        errorCode: 'unknown',
        errorDescription: 'An error occurred while processing your payment',
        orderId: '',
        amount: '',
        cart: { books: [] }
      });
    }
  },
  
  cancelFailedOrder: async (req, res) => {
    try {
      console.log('User cancelled order after payment failure');
      
      res.redirect('/shop');
    } catch (error) {
      console.error('Cancel order error:', error);
      res.redirect('/cart');
    }
  },
  
  retryPayment: async (req, res) => {
    try {
      console.log('User is retrying payment');
      
      res.redirect('/checkout');
    } catch (error) {
      console.error('Retry payment error:', error);
      res.redirect('/checkout');
    }
  }
};

module.exports = razorpayController;