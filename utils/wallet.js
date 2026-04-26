// Deduct amount from user's wallet, return true if successful, false if insufficient
async function deductFromWallet(userId, amount, description, type, referenceId = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Atomic update – only deduct if balance >= amount
    const user = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { session, new: true }
    );
    if (!user) {
      await session.abortTransaction();
      return false;
    }
    await Transaction.create([{
      userId, type, amount: -amount, description, referenceId
    }], { session });
    await session.commitTransaction();
    return true;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}