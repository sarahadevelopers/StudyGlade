// utils/sockets.js

/**
 * Emit an event to a specific user's room
 * @param {Object} io - Socket.io server instance (from req.app.get('io'))
 * @param {string|ObjectId} userId - MongoDB user ID
 * @param {string} event - Event name (e.g., 'wallet_update', 'notification_new')
 * @param {any} data - Data payload
 */
function emitToUser(io, userId, event, data) {
  if (!io) {
    console.error('Socket.io instance not available');
    return;
  }
  io.to(`user_${userId}`).emit(event, data);
}

/**
 * Get Socket.io instance from Express request
 * @param {Object} req - Express request object
 * @returns {Object} Socket.io instance
 */
function getIO(req) {
  return req.app.get('io');
}

/**
 * Emit event using request object (shortcut)
 * @param {Object} req - Express request
 * @param {string|ObjectId} userId - Target user ID
 * @param {string} event - Event name
 * @param {any} data - Payload
 */
function emitToUserFromReq(req, userId, event, data) {
  const io = getIO(req);
  emitToUser(io, userId, event, data);
}

module.exports = {
  emitToUser,
  getIO,
  emitToUserFromReq
};