const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authentication');
const isBlockUser = require('../middleware/isBlock');
const passport = require('passport');
const multer = require('../config/multer');
const invoiceDownloadPDF = require('../controllers/others/orderInvoicepdf');
const isBlocked = require('../middleware/isBlock');


const userLoginController = require('../controllers/user/userLog');
const errorController = require('../controllers/errorController');
const userShopController = require('../controllers/user/userShopController');
const productPageController = require('../controllers/user/userProductPage');

const cartController = require('../controllers/user/userCartController');

const wishListController = require('../controllers/user/wishListController');


const AccountController = require('../controllers/user/userAcountController');

const AccountProfileController = require('../controllers/user/userAccountProfileController');
const profileAddressController = require('../controllers/user/userAddressController');


const checkOutController = require('../controllers/user/userCheckoutController');

const orderController = require("../controllers/user/userOrderController");

const walletController = require('../controllers/user/walletController');

const razorpayController = require('../controllers/user/userRazorpayController');

const referralController = require('../controllers/user/refferalController');

const JWT_Config = require('../config/jwt');
const userAuth = require('../middleware/googleChek');
const { route } = require('./adminRoutes');
const upload = require('../config/multer');


const checkoutPageMiddleware = require('../middleware/checkoutCheck');





router.get('/auth/google/login',userAuth.isAnyOne,userAuth.isBlock,userAuth.cacheController,passport.authenticate("google-login", { scope: ["profile", "email"] }))
router.get("/auth/google/login/callback", userAuth.isAnyOne, userAuth.isBlock,userAuth.googleAuthLoginCallback);

router.get('/auth/google/signup',userAuth.isAnyOne,userAuth.isBlock,userAuth.cacheController,passport.authenticate("google-signup", { scope: ["profile", "email"] }))
router.get('/auth/google/signup/callback', userAuth.isAnyOne, userAuth.isBlock, userAuth.googleAuthSignupCallback);


router.get("/serverError",errorController.userload500);
router.get("/page-not-found",errorController.userload404);









router.get('/',userLoginController.loadLandingPage);





router.route('/login')
.get(userLoginController.loadLogin)
.post(userLoginController.login);




router.route("/signup")
.get(userLoginController.loadSignup)
.post(userLoginController.signup);

router.route("/verify-otp")
.get(userLoginController.Load_signup_Verify_otp)
.post(userLoginController.signup_Verify_otp)




router.route("/forgot-password")
.get(userLoginController.loadForgotPass)
.post(userLoginController.forgotPass);

router.route('/verify-forgotPassword')
  .get(userLoginController.load_verify_forgotPass)
  .post(userLoginController.verify_forgotPass);
  
router.post('/forgot-resend-otp',userLoginController.forgot_resend_otp)

router.post("/resend-otp",userLoginController.signup_resend_otp);
router.route("/reset-password")
    .get(userLoginController.loadResetPassword)
    .post(userLoginController.resetPassword);



router.get('/logout',authMiddleware.isAuthenticated,userLoginController.LogOut);


router.use(authMiddleware.isAuthenticated);



router.get('/about',userLoginController.Loadabout);

router.route('/contact') 
  .get(userLoginController.loadContact) 
  .post()

  router.get('/shop',userShopController.loadShop); 

  router.get('/api/user/status',userLoginController.checkingStatus);

  // router.use(isBlocked)


router.get('/home',userLoginController.loadHome);



 

router.get('/bookPage/:id',productPageController.loadProductPage);




router.get('/account',AccountController.loadAccountPage);





router.get('/account/profile',AccountProfileController.loadAccountProfile);
router.route('/account/edit-profile')
.get(AccountProfileController.loadEditProfile)
.post(upload.single('profileImage'),AccountProfileController.editProfile);

 
router.route('/account/change-password')
  .get(AccountProfileController.loadChangePass)
  .post(AccountProfileController.changePass);

router.route('/verify-change-password') 
    .get(AccountProfileController.loadChangePassOTP) 
    .post(AccountProfileController.changePassOTPSubmit);

router.post('/account/resend-otp',AccountProfileController.resendChangePassOtp);    


router.route('/account/addresses/add')
    .get(profileAddressController.loadAddAddress)
    .post(profileAddressController.addAddress); 

router.delete('/account/addresses/delete/:id',profileAddressController.deleteAddress);
router.post('/account/addresses/make-default/:id',profileAddressController.makeDefault);
router.get('/account/addresses/edit/:id',profileAddressController.loadEditAddress);
router.post('/account/addresses/update/:id',profileAddressController.editAddress)




router.get('/account/wallet',walletController.loadWalletPage)



router.route('/wishlist')  
  .get(wishListController.loadWishList);
router.post('/wishlist/add',wishListController.addToWishlist);
router.delete('/wishlist/clear',wishListController.clearWishlist);
router.delete('/wishlist/remove/:bookId',wishListController.removeItemFromWishlist);


router.get('/wishlist/status',wishListController.shopWishlistStatus);



router.get('/cart',cartController.loadCart); 


router.post('/cart/add',cartController.addToCart);

router.post('/cart/update',cartController.updateCart);
router.post('/cart/remove',cartController.removeItemFromCart);

router.post('/cart/check-stock',cartController.checkStock);   




router.get('/checkout',checkoutPageMiddleware,checkOutController.loadCheckOutPage); 

router.post('/api/apply-coupon',checkOutController.applyCoupen);
router.post('/api/remove-coupon',checkOutController.removeCoupon);


router.get('/api/wallet/balance',checkOutController.walletBalance);
router.post('/api/wallet/pay',checkOutController.walletPay);


 
router.post('/api/create-razorpay-order',razorpayController.createRazorpayOrder);
router.post('/api/verify-razorpay-payment',razorpayController.verifyRazorpayPayment);
router.get('/payment-failed',razorpayController.userPaymentError);
router.get('/cancel-failed-order', razorpayController.cancelFailedOrder);
router.get('/retry-payment', razorpayController.retryPayment);


router.post('/place-order',orderController.userPlacerOrder);
router.get('/account/orders',orderController.loadOrderListPage);
router.get(`/account/orders/:orderId/invoice`,invoiceDownloadPDF)
 

router.get('/order-placed/:orderId',orderController.loadOrderPlacedConfirmation);
router.get('/orders/:orderId',orderController.loadOrderViewPage); 
 

router.post('/api/orders/cancel',orderController.cancelOrder)
router.post('/orders/:orderId/single-product/cancel',orderController.cancelSingleProduct);
router.post('/orders/:orderId/single-product/return',orderController.returnSingleProduct);
router.post('/orders/:orderId/multiple-products/cancel',orderController.bulkProductCancel);
router.post('/orders/:orderId/multiple-products/return',orderController.bulkProductReturn);



router.get('/referral',referralController.loadRefferal);
router.get('/api/user/referral-bonus-status',referralController.referralBonusStatus);


router.use((req, res, next) => {
  res.status(404).render("User/404");
});

module.exports = router;