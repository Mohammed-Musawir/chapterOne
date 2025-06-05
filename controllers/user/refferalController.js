const userModal = require('../../models/userSchema');
const walletModal = require('../../models/walletSchema'); 
const  addTransaction   = require('../../services/transactionService');


const loadRefferal = async (req,res) => {
    try {
        
        const userId = req.user._id || req.user.id;

        const user = await userModal.findById(userId);

        res.render('User/referalPage',{
            user: user,
            message: req.flash('message'),
            title: 'Refer & Earn'
        })
    } catch (error) {
        console.error('Error loading referral page:', error);
        req.flash('error', 'Error loading referral page');
        res.redirect('/account');
    }
}


const referralBonusStatus = async (req,res) => {
    try {

        const userId = req.user.id || req.user._id;
         if (!userId) {
            return res.status(401).json({
                success: false,
                errorType: 'UNAUTHORIZED',
                message: 'User not authenticated'
            });
        }

                const user = await userModal.findById(userId);
                 const referrer = await userModal.findOne({ referralCode:user.
hasAppliedReferralCode });


        

        if (!user) {
            return res.status(404).json({
                success: false,
                errorType: 'USER_NOT_FOUND',
                message: 'User not found'
            });
        }



                const shouldShowBonus = user.hasAppliedReferral && !user.referralBonusShown;

        if (shouldShowBonus) {
            await userModal.findByIdAndUpdate(userId, {
                referralBonusShown: true
            }); 
                            await addTransaction(userId, 'Credit', 100, 'Referral Bonus');
                await addTransaction(referrer._id, 'Credit', 100, 'Referral Reward - Friend Joined');

            return res.json({
                success: true,
                showReferralBonus: true,
                message: 'Referral bonus credited to your wallet!',
                bonusAmount: 100,
                referralCode: user.hasAppliedReferralCode
            });
        }

         return res.json({
            success: true,
            showReferralBonus: false,
            message: 'No referral bonus to show'
        });
    } catch (error) {
                console.error('Error checking referral bonus status:', error);
        return res.status(500).json({
            success: false,
            errorType: 'SERVER_ERROR',
            message: 'Internal server error'
        });
    }
}


module.exports = {
    loadRefferal,
    referralBonusStatus
}
