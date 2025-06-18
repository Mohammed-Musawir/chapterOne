const transactionModal = require('../models/transactionSchema');
const walletModal = require('../models/walletSchema');

const addTransaction = async (userId, type, amount, description) => {
    try {
        let wallet = await walletModal.findOne({userId:userId}); 
    
    if (!wallet) {
        wallet = new walletModal({
            userId,
            amount: 0
        });
    }

    

    if (type === 'Credit') {
        wallet.amount += Math.floor(amount);
    } else if (type === 'Debit') { 
        if (wallet.amount < Math.round(amount)) {
            throw new Error('Insufficient wallet balance');
        }
        wallet.amount -= Math.floor(amount);
    } else {
        throw new Error('Invalid transaction type');
    }

    await wallet.save();

    amount = Math.floor(amount);
 
    const transaction = new transactionModal({
        userId,
        type,
        amount,
        description
    });

    await transaction.save();
    } catch (error) {
         console.error('Error in addTransaction:', error.message);
        throw error;
    }
};

module.exports = addTransaction;