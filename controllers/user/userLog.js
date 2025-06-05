const productModal = require('../../models/productSchema');
const categoryModel = require('../../models/categorySchema');
const userModel = require('../../models/userSchema');
const bycript = require('bcryptjs');
const offerModal = require('../../models/offerSchema');
const wishlistModal = require('../../models/wishlistSchema');
const contactModal = require('../../models/contactSchema');
const nodemailer = require('nodemailer');
require('dotenv').config();
const JWT_Config = require('../../config/jwt');
const { use } = require('passport');
const  addTransaction   = require('../../services/transactionService');



const transporter = nodemailer.createTransport({
    service:"gmail",
    port: 465, 
    secure: true,
    auth:{
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    secure: true 
})


function generateOTP(){
    return Math.floor(100000 + Math.random() * 900000); 
}



const loadLandingPage = async (req,res) => {
    try {
        if(req.cookies.userToken){
            return res.redirect('/home')
        }
       
        const books = await productModal.find().limit(6)
        const categories = await categoryModel.find().limit(3)
        res.render('User/userLandingPage',{books,categories});
    } catch (error) {
        res.redirect('/page-not-found');
        console.log(`Error in Controller in user in loadLandingPage 
            the Error is ${error}`)
    }
}




const loadHome = async (req, res) => {
    try {
      if (!req.user) {
       
        res.clearCookie('userToken');
        return res.redirect('/login');
      }
     
      const userID = req.user._id || req.user.id;

      const user = await userModel.findById(userID);

      const wishlist = await wishlistModal.findOne({userId: userID});
      
      
      const activeOffers = await offerModal.find({
        isActive: true,
        endDate: { $gt: new Date() }
      });
      
      
      let books = await productModal.find().limit(6);
      const categories = await categoryModel.find().limit(3);
      
      
      books = books.map(book => {
        const bookObj = book.toObject();
        bookObj.discount = 0;
        bookObj.discountedPrice = bookObj.salePrice;
        
        
        const productOffer = activeOffers.find(
          offer => offer.offerType === 'product' && offer.product && offer.product.toString() === bookObj._id.toString()
        );
        
        if (productOffer) {
          bookObj.discount = productOffer.discountPercentage;
          bookObj.discountedPrice = Math.round(bookObj.salePrice * (1 - productOffer.discountPercentage / 100));
          bookObj.offerName = productOffer.name;
          return bookObj;
        }
        
        
        if (bookObj.category) {
          const categoryOffer = activeOffers.find(
            offer => offer.offerType === 'category' && offer.category && offer.category.toString() === bookObj.category.toString()
          );
          
          if (categoryOffer) {
            bookObj.discount = categoryOffer.discountPercentage;
            bookObj.discountedPrice = Math.round(bookObj.salePrice * (1 - categoryOffer.discountPercentage / 100));
            bookObj.offerName = categoryOffer.name;
          }
        }
        
        return bookObj;
      });
      
      
      books.sort((a, b) => b.discount - a.discount);
      
      res.render('User/userHomePage', {books, categories, wishlist, user});
    } catch (error) {
      res.redirect('/page-not-found');
      console.log(`Error in Controller in user in loadHome the Error is ${error}`);
    }
  };



const loadLogin = async (req,res) => {
    try {
        if(req.cookies.userToken){
            return res.redirect('/home')
        }
        res.render('User/userLogin')
    } catch (error) {
        res.redirect('/page-not-found');
        console.log(`error in userController in userLog in loadLogin`)
    console.log(error)
    }
}


const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'emailNotFound',
                message: 'Email not found in our system'
            });
        }
        
        if (user.isBlocked) {
            return res.status(403).json({
                success: false,
                error: 'UserIsBanned',
                message: 'Your account has been suspended'
            });
        }
        
        const isMatch = await bycript.compare(password, user.password);
        
        if (!isMatch) {
            console.log(`in userLog in login password is not match`);
            return res.status(401).json({
                success: false,
                error: 'passwordIncorrect',
                message: 'Incorrect password'
            });
        }
        
        const token = await JWT_Config.generateToken(user.toObject());
        
        res.cookie('userToken', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        });
        
        res.status(200).json({
            success: true,
            message: 'Login successful'
        });
        
    } catch (error) {
        console.log(`Error in Controller in user in userLog the Error is ${error}`);
        res.status(500).json({
            success: false,
            error: 'serverError',
            message: 'An unexpected error occurred'
        });
    }
};









const loadForgotPass = async (req,res) => {
    try {
        res.render('User/forgotPass')
    } catch (error) {
        res.redirect('/page-not-found'); 
        console.log(`Error in User in userLog in  forgotPass
            the Error is ${error}`)
    }
}

const forgotPass = async (req,res) => {
    try {
        const {email} = req.body;

        const user = await userModel.findOne({email});
        if(!user){
            return res.status(404).json({ 
                success: false, 
                message: "User with this email does not exist" 
            });
        }

        if (user.googleId) {

            return res.status(400).json({
                success: false,
                message: "This account is linked to Google. Please use Google sign-in instead."
            });
        }

        req.session.userEmail = email;
        const otp = await generateOTP(); 

        req.session.otp = otp;
        
        const mailOptions = {
            from: process.env.EMAIL_USER, 
            to: email,
            subject: 'Email Verification OTP',
            text: `Your OTP for email verification is: ${otp}`
        }
        
        await transporter.sendMail(mailOptions);
        console.log('Email sent to: ' + email);
        console.log(`The Otp for forgot password ${otp}`);


                return res.status(200).json({ 
            success: true, 
            message: "OTP sent successfully",
            redirect: "/verify-forgotPassword"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "An error occurred while processing your request",
            error: error.message
        });
    }
}



const load_verify_forgotPass = async (req,res) => {
    try {
        res.render("User/forgotPassOtp",{email : req.session.userEmail});
    } catch (error) {
        console.log(`Error in userLog in load_verify_forgotPass
            Error is ${error}`);
            res.render("500");
    }
}

const verify_forgotPass = async (req,res) => {
    try {
        if (!req.session.otp || !req.session.userEmail) {
            
            return res.status(400).json({
                success: false,
                message: "Session expired. Please request a new OTP.",
                redirectUrl: '/forgotPass'
            });
        }
        const {otp} = req.body;
        if(req.session.otp.toString() !== otp){
            return res.status(400).json({
                success: false,
                message: "Incorrect OTP. Please try again."
            });
        }

        
        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            redirectUrl: '/reset-password'
        });

    } catch (error) {
        console.log(`Error in userLog in verify_forgotPass. Error is ${error}`);
        return res.status(500).json({
            success: false,
            message: "An error occurred. Please try again later."
        });
    }
}

const loadResetPassword = async (req,res) => {
    try {
        if(!req.session.userEmail && !req.session.otp){
            return res.redirect('/login')
        }
        
        res.render('User/resetPass')
    } catch (error) {
        console.log(`Error in userLog in loadResetPassword
            Error is ${error}`);
        res.render("500");
    }
}

const resetPassword = async (req,res) => {
    try {
        const {password,confirmPassword} = req.body 
        const email = req.session.userEmail;

        const response = {
            success: false,
            message: ''
        };

        if(password !== confirmPassword){
            response.message = 'Passwords do not match';
            return res.status(400).json(response);
        }

        const isValidPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
                console.log("Received Password:", password); 

                if (!isValidPassword.test(password)) {
                    console.log("password is not Valid in userLog controller resetPassword");
                    response.message = 'Password must contain at least 1 uppercase, 1 lowercase, 1 digit, 1 special character, and be at least 8 characters long';
            return res.status(400).json(response);
                }

        const hashedPassword = await bycript.hash(password,10);

        const user = await userModel.findOneAndUpdate({email},{$set:{ password : hashedPassword}});

        if (!user) {
            console.log(`User not found while resetting password`);
            response.message = 'User not found';
            return res.status(404).json(response);
        }
       
        delete req.session.userEmail;
        delete req.session.otp;

        response.success = true;
        response.message = 'Password reset successfully';
        return res.status(200).json(response);

    } catch (error) {
        console.log(`Error in userLog in resetPassword
            Error is ${error}`);
            return res.status(500).json({
                success: false,
                message: 'An error occurred. Please try again later.'
            });
    }
}


 

const forgot_resend_otp = async (req,res) => {
    try {
        if (!req.session.userEmail) {
            return res.status(400).json({ success: false, message: "Session expired. Please try again." });
        }
        
        
        const newOtp = generateOTP();
        req.session.otp = newOtp;
       
        
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.session.userEmail,
            subject: 'Resend OTP - Password Reset',
            text: `Your new OTP for password reset is: ${newOtp}`
        };

        await transporter.sendMail(mailOptions);
        console.log('Resend OTP email sent to: ' + req.session.userEmail);
        console.log(`The resend Otp for forgot password is ${newOtp}`);
        res.status(200).json({success:true, message: "A new OTP has been sent to your email." });

    } catch (error) {
        console.log(`Error in userLog in forgot_resend_otp
            Error is ${error}`);
            res.render("500");
    }
}





const loadSignup = async (req,res) => {
    try {
        if(req.cookies.userToken){
            return res.redirect('/home')
        }
        const message = req.session.message;
        delete req.session.message; 
        
        res.render('User/userSignup', { message: message,massege:"" })
    } catch (error) {
        res.redirect('/page-not-found');
        console.log(`error userController in userLog in loadSignup
            Error is ${error}`);
        
    }
}




const signup = async (req, res) => {
    try {
        const { firstName, lastName, email, mobileNumber, password, confirmPassword ,referralCode } = req.body;

        
        if (!firstName || !lastName || !email || !mobileNumber || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                errors: {
                    firstName: !firstName ? "First name is required" : null,
                    lastName: !lastName ? "Last name is required" : null,
                    email: !email ? "Email is required" : null,
                    mobile: !mobileNumber ? "Mobile number is required" : null,
                    password: !password ? "Password is required" : null,
                    confirmPassword: !confirmPassword ? "Confirm password is required" : null
                }
            });
        }

        
        if (password !== confirmPassword) {
            console.log("Passwords do not match in user controller signup");
            return res.status(400).json({
                success: false,
                errors: {
                    confirmPassword: "Passwords do not match"
                }
            });
        }

        
        const userEmail = await userModel.findOne({ email });
        if (userEmail) {
            console.log("Email already exists in user controller signup");
            return res.status(400).json({
                success: false,
                errorType: "userExists",
                errors: {
                    email: "Email already exists. Please use a different email or login"
                }
            });
        }

        
        const isValidMobile = /^(?!([0-9])\1{9}$)(?!.*(?:123456|654321|101010|000000)).{10}$/.test(mobileNumber);
        if (!isValidMobile) {
            console.log("Invalid mobile number in user controller signup");
            return res.status(400).json({
                success: false,
                errors: {
                    mobile: "Please enter a valid mobile number"
                }
            });
        }

        
        const isValidPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        console.log("Received Password:", password);
        if (!isValidPassword.test(password)) {
            console.log("Password is not valid in user controller signup");
            return res.status(400).json({
                success: false,
                errors: {
                    password: "Password must contain at least 1 uppercase, 1 lowercase, 1 digit, 1 special character, and be at least 8 characters long"
                }
            });
        }

                let validatedReferralCode = null;
        if (referralCode && referralCode.trim() !== '') {
            const referralUser = await userModel.findOne({ 
                referralCode: referralCode.trim().toUpperCase() 
            });
            
            if (!referralUser) {
                console.log("Invalid referral code provided:", referralCode);
                return res.status(400).json({
                    success: false,
                    errors: {
                        referralCode: "Invalid referral code. Please check and try again."
                    }
                });
            }

             validatedReferralCode = referralCode.trim().toUpperCase();
            console.log("Valid referral code provided:", validatedReferralCode);
        }

        
        req.session.userData = {
            firstname: firstName,
            lastname: lastName,
            email,
            mobile: mobileNumber,
            password: password,
            referralCode: validatedReferralCode
        };

        
        const otp = await generateOTP();
        req.session.otp = otp;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Email Verification OTP',
            text: `Your OTP for email verification is: ${otp}`
        };

        await transporter.sendMail(mailOptions);
        console.log('Email sent to: ' + email);
        console.log(`The OTP is ${req.session.otp}`);

        req.session.secretKey = 'Verify-Key';
        
        
        return res.status(200).json({
            success: true,
            message: "Signup successful! Please verify your email.",
            redirect: "/verify-otp"
        });
        
    } catch (error) {
        console.log(`Error in userController in signup: ${error}`);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred. Please try again later."
        });
    }
};


const Load_signup_Verify_otp = async (req,res) => {
    try {
        if (!req.session.secretKey || req.session.secretKey !== 'Verify-Key') {
            return res.redirect('/signup');
        }
        if (!req.session.userData || !req.session.userData.email) {
            return res.redirect('/signup');
        }
        if (!req.session.otp) {
            return res.redirect('/signup');
        }
        res.render('User/verify-otp');
    } catch (error) {
        console.log(`Error in Load_signup_Verify_otp in UserLog controller`, error);
        res.render("500");
    }
}

const signup_Verify_otp = async (req,res) => {
    try {
        if (!req.session.secretKey || req.session.secretKey !== 'Verify-Key') {
            return res.redirect('/signup');
        }
        if (!req.session.userData || !req.session.otp) {
            return res.redirect('/signup');
        }
        const OTP = req.body.otp1 + req.body.otp2 + req.body.otp3 + req.body.otp4 + req.body.otp5 + req.body.otp6;
        if(req.session.otp != OTP){
            console.log(`Incorrect OTP in verify_otp`)
            return res.render("User/verify-otp",{error: true, message: "Incorrect OTP" });
        }

        const hashedPassword = await bycript.hash(req.session.userData.password,10)
        
         const referrer = await userModel.findOne({ referralCode:req.session.userData.referralCode });

                 if (!referrer) {
            return res.status(404).json({
                success: false,
                message: "Invalid referral code"
            });
        }

        let user = new userModel({
            firstname: req.session.userData.firstname,
            lastname: req.session.userData.lastname,
            email: req.session.userData.email,
            mobile: req.session.userData.mobile,
            password: hashedPassword,
            hasAppliedReferral:true,
            hasAppliedReferralCode:req.session.userData.referralCode
        });
        await user.save();

        
        const mailOptions = {
            from: process.env.EMAIL_USER, 
            to: req.session.userData.email,
            subject: 'Welcome to ChapterOne - Your Reading Journey Begins!',
            text: `Dear ${req.session.userData.firstname} ${req.session.userData.lastname},

Welcome to ChapterOne! 🎉 We're thrilled to have you as a part of our book-loving community.

Your account has been successfully created, and you're now ready to explore a wide collection of books, exclusive deals, and personalized recommendations.

📚 What’s next?
✅ Browse our collection and discover your next great read
✅ Save your favorites to your wishlist
✅ Enjoy special discounts and member-only offers

Start exploring now: [Insert website link]

If you have any questions, feel free to reach out to us at [Your Support Email]. Happy reading!

Best regards,
The ChapterOne Team`
        }
        await transporter.sendMail(mailOptions);
            console.log('registered Email sent to: ' + req.session.userData.email);


        delete req.session.secretKey
        delete req.session.otp;
        delete req.session.userData;

        res.redirect('/login') 

    } catch (error) {
        res.render("500");
        console.log(`Error in Controller in user in verify_otp 
            the Error is ${error}`)
    }
}

const signup_resend_otp = async (req,res) => {
    try {
        if (!req.session.userData || !req.session.userData.email) {
            return res.status(400).json({ message: "Session expired. Please sign up again." });
        }
        const newOtp = generateOTP();
        req.session.otp = newOtp;
        

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: req.session.userData.email,
            subject: 'Resend OTP - Email Verification',
            text: `Your new OTP for email verification is: ${newOtp}`
        };

        await transporter.sendMail(mailOptions);
        console.log(`New OTP sent to: ${req.session.userData.email}`);
        console.log(`The resend Otp is ${req.session.otp}`)

        res.status(200).json({success:true, message: "A new OTP has been sent to your email." });


    } catch (error) {
        console.log(`Error in signup_resend_otp: ${error}`);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const loadContact = async (req,res) => {
    try {
            let user = null;

   
    if (req.user?._id || req.user?.id) {
      const userId = req.user._id || req.user.id;
      user = await userModel.findById(userId);
    }
        res.render('User/contactPage', {user})
    } catch (error) {
        console.log(`Error in LoadContact: ${error}`);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const sendUsContact = async (req,res) => {
    try {
        const { name, email, subject, message } = req.body;

        const userId = req.user._id;

        const newMessage = new categoryModel({userId, name, email, message})

        await newMessage.save();


        const mailOptions = {
            from: email,
            to: process.env.EMAIL_USER,
            subject: "New Contact Form Message",
            text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success:true, message: "Error in sending Message" });
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

const Loadabout = async (req, res) => {
  try {
    let user = null;

    
    if (req.user?._id || req.user?.id) {
      const userId = req.user._id || req.user.id;
      user = await userModel.findById(userId);
    }

    res.render('User/userAbout', { user }); 
  } catch (error) {
    console.log(`Error in LoadAbout: ${error}`);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const checkingStatus = async (req,res) => {
    try {
        const userId = req.user?._id||req.user?.id; 
        
        

        const clearUserSession = () => {
            res.clearCookie('userToken'); 
            req.user = null;
        };
        
       
        if (!userId) {
            
            clearUserSession()
            return res.status(401).json({
                success: false,
                message: 'Unauthorized access. Please log in.',
                errorType: 'UNAUTHORIZED'
            });
        }
        
        
        const user = await userModel.findById(userId);
        
        
        if (!user) {
            clearUserSession()
            return res.status(404).json({
                success: false,
                message: 'User not found',
                errorType: 'USER_NOT_FOUND'
            });
        }
        
        
        if (user.isBlocked) {
            clearUserSession()
            return res.status(403).json({
                success: false,
                message: 'Your account is inactive. Contact support for help.',
                errorType: 'USER_BLOCKED'
            });
        }
        
        
        return res.status(200).json({
            success: true,
            message: 'User is active',
            userData: {
                name: user.fullName,
                email: user.email,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error(`Error checking user status: ${error.message}`);
        res.clearCookie('token'); 
        req.user = null; 
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            errorType: 'SERVER_ERROR'
        });
    }
}


const LogOut = async (req,res) => {
    try {
        res.clearCookie("userToken");
        req.session.destroy();
        res.redirect('/login')
    } catch (error) {
        console.log(`Error in User in userLog in LogOut 
            the Error is ${error}`)
            res.render("500");
    }
} 

 


module.exports = {
    loadLandingPage,
    loadHome,

    loadLogin,
    login,

    loadForgotPass,
    forgotPass,

    load_verify_forgotPass,
    verify_forgotPass,
    forgot_resend_otp,

    loadResetPassword,
    resetPassword,

    loadSignup,
    signup,

    Load_signup_Verify_otp,
    signup_Verify_otp,
    signup_resend_otp,

    Loadabout,
    loadContact,

    checkingStatus,

    LogOut
}