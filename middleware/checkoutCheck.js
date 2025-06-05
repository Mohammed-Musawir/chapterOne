const Cart = require('../models/cartSchema');

module.exports = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id; 
    const cart = await Cart.findOne({ userId });
    

        if (req.query.retryOrderId) {
            return next();
          }

    if (!cart || !cart.books || cart.books.length === 0) {
      return res.status(204).redirect('/cart'); 
    }
    
    next();
  } catch (error) {
    console.error("Error checking cart:", error);
    res.status(500).json({ message: 'Server error' });
  }
};